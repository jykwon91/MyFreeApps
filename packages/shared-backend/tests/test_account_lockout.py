"""Unit tests for ``platform_shared.services.account_lockout``.

Covers the pure / app-agnostic surface promoted in PR M7 — the final
M-series PR of the shared-backend migration. App-level integration
(``UserManager.authenticate`` glue, the back-compat shim under
``app.services.user.account_service``, and the route-level
``check_account_not_locked`` dependency) stays in MyBookkeeper.

What lives here:

  * ``lock_duration_for`` — exponential backoff schedule produces
    ``[1m, 5m, 15m, 1h, 24h]`` byte-identical with MBK production
  * ``record_failed_login`` — counter increment, threshold-triggered
    lock, audit-event emission shape
  * ``record_successful_login_update`` — clear semantics
  * ``is_locked`` — time comparison
  * ``autoreset_update_if_stale`` — 24h-stale auto-reset rule
  * Regression guard — the shared module never imports any ``app.*``
    symbol (would re-couple it to MBK and break every other consumer)
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.db.models.auth_event import AuthEvent
from platform_shared.services.account_lockout import (
    DEFAULT_AUTORESET_HOURS,
    DEFAULT_LOCK_DURATIONS,
    DEFAULT_LOCKOUT_THRESHOLD,
    LockoutAccount,
    autoreset_update_if_stale,
    emit_locked_login_event,
    is_locked,
    lock_duration_for,
    record_failed_login,
    record_successful_login_update,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@dataclass
class _FakeAccount:
    """Minimal :class:`LockoutAccount` for tests — only the three columns."""

    failed_login_count: int = 0
    locked_until: datetime | None = None
    last_failed_login_at: datetime | None = None
    id: uuid.UUID = uuid.uuid4()


async def _events(db: AsyncSession) -> list[AuthEvent]:
    return list((await db.execute(select(AuthEvent))).scalars().all())


# ---------------------------------------------------------------------------
# Defaults — MBK production parity
# ---------------------------------------------------------------------------


class TestDefaults:
    def test_threshold_is_5(self) -> None:
        assert DEFAULT_LOCKOUT_THRESHOLD == 5

    def test_autoreset_is_24h(self) -> None:
        assert DEFAULT_AUTORESET_HOURS == 24

    def test_schedule_is_1m_5m_15m_1h_24h(self) -> None:
        """Production cadence — must NOT change without a data migration."""
        assert DEFAULT_LOCK_DURATIONS == [
            timedelta(minutes=1),
            timedelta(minutes=5),
            timedelta(minutes=15),
            timedelta(hours=1),
            timedelta(hours=24),
        ]


# ---------------------------------------------------------------------------
# lock_duration_for — exponential backoff
# ---------------------------------------------------------------------------


class TestLockDurationFor:
    def test_threshold_gives_1_minute(self) -> None:
        assert lock_duration_for(5) == timedelta(minutes=1)

    def test_threshold_plus_1_gives_5_minutes(self) -> None:
        assert lock_duration_for(6) == timedelta(minutes=5)

    def test_threshold_plus_2_gives_15_minutes(self) -> None:
        assert lock_duration_for(7) == timedelta(minutes=15)

    def test_threshold_plus_3_gives_1_hour(self) -> None:
        assert lock_duration_for(8) == timedelta(hours=1)

    def test_threshold_plus_4_gives_24_hours(self) -> None:
        assert lock_duration_for(9) == timedelta(hours=24)

    def test_large_count_clamps_to_24_hours(self) -> None:
        """Worst-case lockout caps at 24h — prevents indefinite DoS of a real user."""
        assert lock_duration_for(99) == timedelta(hours=24)

    def test_below_threshold_raises(self) -> None:
        """Calling with a count below threshold is a programmer error."""
        with pytest.raises(ValueError):
            lock_duration_for(4)  # threshold=5 default

    def test_custom_threshold(self) -> None:
        assert lock_duration_for(3, threshold=3) == timedelta(minutes=1)

    def test_custom_schedule(self) -> None:
        custom = [timedelta(seconds=10), timedelta(seconds=30)]
        assert lock_duration_for(5, schedule=custom) == timedelta(seconds=10)
        assert lock_duration_for(6, schedule=custom) == timedelta(seconds=30)
        # Clamps to the last entry.
        assert lock_duration_for(99, schedule=custom) == timedelta(seconds=30)

    def test_empty_schedule_raises(self) -> None:
        with pytest.raises(ValueError):
            lock_duration_for(5, schedule=[])


# ---------------------------------------------------------------------------
# is_locked
# ---------------------------------------------------------------------------


class TestIsLocked:
    def test_locked_when_locked_until_in_future(self) -> None:
        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        account = _FakeAccount(locked_until=future)
        assert is_locked(account) is True

    def test_not_locked_when_locked_until_in_past(self) -> None:
        past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
        account = _FakeAccount(locked_until=past)
        assert is_locked(account) is False

    def test_not_locked_when_locked_until_is_none(self) -> None:
        account = _FakeAccount(locked_until=None)
        assert is_locked(account) is False

    def test_now_parameter_is_respected(self) -> None:
        """Allows deterministic tests at fixed wall-clock times."""
        anchor = datetime(2026, 1, 1, tzinfo=timezone.utc)
        future = anchor + timedelta(minutes=5)
        account = _FakeAccount(locked_until=future)
        assert is_locked(account, now=anchor) is True
        assert is_locked(account, now=anchor + timedelta(minutes=10)) is False


# ---------------------------------------------------------------------------
# record_successful_login_update
# ---------------------------------------------------------------------------


class TestRecordSuccessfulLoginUpdate:
    def test_returns_clear_dict_when_count_nonzero(self) -> None:
        account = _FakeAccount(failed_login_count=3)
        update = record_successful_login_update(account)
        assert update == {
            "failed_login_count": 0,
            "last_failed_login_at": None,
            "locked_until": None,
        }

    def test_returns_clear_dict_when_locked(self) -> None:
        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        account = _FakeAccount(failed_login_count=0, locked_until=future)
        update = record_successful_login_update(account)
        assert update is not None
        assert update["locked_until"] is None
        assert update["failed_login_count"] == 0
        assert update["last_failed_login_at"] is None

    def test_returns_none_when_already_clear(self) -> None:
        """If the account is already fully clear, no DB write is needed."""
        account = _FakeAccount(failed_login_count=0, locked_until=None)
        assert record_successful_login_update(account) is None


# ---------------------------------------------------------------------------
# autoreset_update_if_stale
# ---------------------------------------------------------------------------


class TestAutoresetIfStale:
    def test_stale_counter_returns_reset_dict(self) -> None:
        now = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        stale = now - timedelta(hours=DEFAULT_AUTORESET_HOURS + 1)
        account = _FakeAccount(failed_login_count=3, last_failed_login_at=stale)
        update = autoreset_update_if_stale(account, now=now)
        assert update == {
            "failed_login_count": 0,
            "last_failed_login_at": None,
            "locked_until": None,
        }

    def test_recent_counter_returns_none(self) -> None:
        now = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        recent = now - timedelta(hours=1)
        account = _FakeAccount(failed_login_count=3, last_failed_login_at=recent)
        assert autoreset_update_if_stale(account, now=now) is None

    def test_zero_counter_returns_none_even_if_stale(self) -> None:
        """Nothing to reset if the counter is already 0."""
        now = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        stale = now - timedelta(days=30)
        account = _FakeAccount(failed_login_count=0, last_failed_login_at=stale)
        assert autoreset_update_if_stale(account, now=now) is None

    def test_no_last_failure_returns_none(self) -> None:
        """Edge case — non-zero counter but no timestamp. Don't auto-reset
        without evidence the failure is old."""
        now = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        account = _FakeAccount(failed_login_count=3, last_failed_login_at=None)
        assert autoreset_update_if_stale(account, now=now) is None

    def test_custom_autoreset_hours(self) -> None:
        now = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        # 2 hours ago — stale under a 1h policy, fresh under default 24h.
        last = now - timedelta(hours=2)
        account = _FakeAccount(failed_login_count=3, last_failed_login_at=last)
        assert autoreset_update_if_stale(account, now=now, autoreset_hours=1) is not None
        assert autoreset_update_if_stale(account, now=now, autoreset_hours=24) is None


# ---------------------------------------------------------------------------
# record_failed_login
# ---------------------------------------------------------------------------


class TestRecordFailedLogin:
    @pytest.mark.anyio
    async def test_below_threshold_increments_no_lock(self, db: AsyncSession) -> None:
        """Failures below the threshold bump the counter without applying a lock."""
        account = _FakeAccount(failed_login_count=2)
        update = await record_failed_login(
            account,
            db=db,
            user_id=account.id,
            metadata={"reason": "bad_password"},
        )
        assert update["failed_login_count"] == 3
        assert update["last_failed_login_at"] is not None
        assert "locked_until" not in update

    @pytest.mark.anyio
    async def test_threshold_attempt_applies_first_lock(self, db: AsyncSession) -> None:
        """The threshold-th consecutive failure triggers the 1-minute lock."""
        # 4 prior failures → this attempt is the 5th.
        account = _FakeAccount(failed_login_count=4)
        anchor = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        update = await record_failed_login(
            account,
            db=db,
            user_id=account.id,
            now=anchor,
            metadata={"reason": "bad_password"},
        )
        assert update["failed_login_count"] == 5
        assert update["locked_until"] == anchor + timedelta(minutes=1)

    @pytest.mark.anyio
    async def test_escalates_to_5_minutes_on_next_failure(self, db: AsyncSession) -> None:
        account = _FakeAccount(failed_login_count=5)
        anchor = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        update = await record_failed_login(
            account, db=db, user_id=account.id, now=anchor,
        )
        assert update["failed_login_count"] == 6
        assert update["locked_until"] == anchor + timedelta(minutes=5)

    @pytest.mark.anyio
    async def test_persists_audit_row_with_user_id(self, db: AsyncSession) -> None:
        """LOGIN_FAILURE row contains user_id when known."""
        account = _FakeAccount(failed_login_count=0)
        await record_failed_login(
            account,
            db=db,
            user_id=account.id,
            metadata={"reason": "bad_password"},
        )

        rows = await _events(db)
        failure_rows = [r for r in rows if r.event_type == AuthEventType.LOGIN_FAILURE]
        assert len(failure_rows) == 1
        ev = failure_rows[0]
        assert ev.user_id == account.id
        assert ev.succeeded is False
        assert ev.event_metadata.get("reason") == "bad_password"
        # Sanity — no leak of the password or full email.
        assert "password" not in ev.event_metadata
        assert "email" not in ev.event_metadata

    @pytest.mark.anyio
    async def test_anonymous_failure_writes_user_id_none(self, db: AsyncSession) -> None:
        """When user_id is None (unknown email path), the audit row stays anonymous.

        The shared helper should accept ``user_id=None`` without crashing —
        an anonymous-failure caller (the ``UserNotExists`` branch in
        UserManager) currently emits its own audit row, but if a future
        caller wants to delegate fully, the helper supports it.
        """
        account = _FakeAccount(failed_login_count=0)
        await record_failed_login(
            account,
            db=db,
            user_id=None,
            metadata={"email_domain": "example.com", "reason": "unknown_email"},
        )
        rows = await _events(db)
        failure_rows = [r for r in rows if r.event_type == AuthEventType.LOGIN_FAILURE]
        assert len(failure_rows) == 1
        assert failure_rows[0].user_id is None
        assert failure_rows[0].event_metadata.get("email_domain") == "example.com"

    @pytest.mark.anyio
    async def test_threshold_attempt_does_not_emit_blocked_locked_event(
        self, db: AsyncSession,
    ) -> None:
        """Lock-application emits ONLY ``LOGIN_FAILURE`` — byte-identical with
        MBK pre-M7. ``LOGIN_BLOCKED_LOCKED`` is reserved for SUBSEQUENT
        attempts on an already-locked account (routed through
        :func:`emit_locked_login_event` by the caller). Doubling up at the
        lock-application moment would skew audit-volume dashboards.
        """
        account = _FakeAccount(failed_login_count=4)
        await record_failed_login(
            account,
            db=db,
            user_id=account.id,
            metadata={"reason": "bad_password"},
        )

        rows = await _events(db)
        types = [r.event_type for r in rows]
        # Threshold-crossing attempt: only LOGIN_FAILURE, never LOGIN_BLOCKED_LOCKED.
        assert types.count(AuthEventType.LOGIN_FAILURE) == 1
        assert AuthEventType.LOGIN_BLOCKED_LOCKED not in types

    @pytest.mark.anyio
    async def test_below_threshold_does_not_emit_blocked_event(self, db: AsyncSession) -> None:
        """Sub-threshold failures only emit LOGIN_FAILURE, not LOGIN_BLOCKED_LOCKED."""
        account = _FakeAccount(failed_login_count=0)
        await record_failed_login(account, db=db, user_id=account.id)

        rows = await _events(db)
        types = [r.event_type for r in rows]
        assert AuthEventType.LOGIN_FAILURE in types
        assert AuthEventType.LOGIN_BLOCKED_LOCKED not in types

    @pytest.mark.anyio
    async def test_custom_threshold_respected(self, db: AsyncSession) -> None:
        """Passing a tighter threshold locks earlier."""
        account = _FakeAccount(failed_login_count=2)
        update = await record_failed_login(
            account,
            db=db,
            user_id=account.id,
            lockout_threshold=3,
        )
        assert "locked_until" in update
        assert update["failed_login_count"] == 3

    @pytest.mark.anyio
    async def test_log_event_seam_can_be_overridden(self, db: AsyncSession) -> None:
        """Tests / per-app overrides can swap the audit writer entirely."""
        called: list[dict[str, Any]] = []

        async def _capture(_db: AsyncSession, **kwargs: Any) -> None:
            called.append(kwargs)

        account = _FakeAccount(failed_login_count=0)
        await record_failed_login(
            account, db=db, user_id=account.id, log_event=_capture,
        )
        assert len(called) == 1
        assert called[0]["event_type"] == AuthEventType.LOGIN_FAILURE


# ---------------------------------------------------------------------------
# emit_locked_login_event
# ---------------------------------------------------------------------------


class TestEmitLockedLoginEvent:
    @pytest.mark.anyio
    async def test_writes_blocked_locked_audit_row(self, db: AsyncSession) -> None:
        user_id = uuid.uuid4()
        await emit_locked_login_event(db=db, user_id=user_id)

        rows = await _events(db)
        assert len(rows) == 1
        assert rows[0].event_type == AuthEventType.LOGIN_BLOCKED_LOCKED
        assert rows[0].user_id == user_id
        assert rows[0].succeeded is False


# ---------------------------------------------------------------------------
# Protocol — structural typing check
# ---------------------------------------------------------------------------


class TestLockoutAccountProtocol:
    def test_dataclass_with_three_fields_satisfies_protocol(self) -> None:
        """Any object with the three lockout fields satisfies ``LockoutAccount``."""
        account = _FakeAccount()
        assert isinstance(account, LockoutAccount)

    def test_object_missing_fields_does_not_satisfy_protocol(self) -> None:
        class Bare:
            pass

        assert not isinstance(Bare(), LockoutAccount)


# ---------------------------------------------------------------------------
# Regression guard — shared module never imports any app code
# ---------------------------------------------------------------------------


class TestSharedModuleHasNoAppImports:
    def test_account_lockout_module_does_not_import_app(self) -> None:
        """``platform_shared.services.account_lockout`` must stay app-agnostic.

        If a future change re-introduces ``from app.core.config import
        settings`` (or any other ``app.*`` import) the shared package
        will only work inside MyBookkeeper — every other consumer
        (MyJobHunter, future apps) breaks at import time. This regression
        guard fails loudly.
        """
        import platform_shared.services.account_lockout as mod

        source: str = ""
        if mod.__file__:
            with open(mod.__file__, encoding="utf-8") as fh:
                source = fh.read()

        offending = [
            line for line in source.splitlines()
            if line.strip().startswith(("from app.", "import app."))
        ]
        assert offending == [], (
            "platform_shared.services.account_lockout must not import from `app.*`; "
            f"found: {offending}"
        )
