"""Account-level login lockout in MyJobHunter UserManager.authenticate (PR C3).

Tests cover:
- Failure counter increment and lock trigger at threshold
- Lock persists even when correct password is supplied
- Successful login resets the counter
- Lock escalates on repeat failures after a lock expires (1m → 5m → 15m → 1h → 24h)
- 24-hour auto-reset of stale failure counters
- Locked attempt emits a LOGIN_BLOCKED_LOCKED auth event
- 6th request while locked returns 429 with the shared generic body
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from platform_shared.core.auth_events import AuthEventType
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL

from app.core.auth import UserManager, _lock_duration_for
from app.core.config import settings
from app.core.rate_limit import RateLimiter, check_account_not_locked


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_credentials(
    email: str = "user@example.com", password: str = "secret",
) -> OAuth2PasswordRequestForm:
    form = MagicMock(spec=OAuth2PasswordRequestForm)
    form.username = email
    form.password = password
    return form


def _make_user(
    *,
    failed_login_count: int = 0,
    locked_until: datetime | None = None,
    last_failed_login_at: datetime | None = None,
    email: str = "user@example.com",
    totp_enabled: bool = False,
) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = email
    user.failed_login_count = failed_login_count
    user.locked_until = locked_until
    user.last_failed_login_at = last_failed_login_at
    user.totp_enabled = totp_enabled
    user.is_verified = True
    user.is_active = True
    return user


def _make_manager(user: MagicMock | None) -> UserManager:
    """Build a UserManager with mocked user_db and get_by_email."""
    manager = UserManager.__new__(UserManager)

    user_db = MagicMock()
    user_db.update = AsyncMock()
    user_db.session = MagicMock()

    if user is None:
        from fastapi_users import exceptions as fu_exceptions
        manager.get_by_email = AsyncMock(side_effect=fu_exceptions.UserNotExists())
    else:
        manager.get_by_email = AsyncMock(return_value=user)

    manager.user_db = user_db
    manager.password_helper = MagicMock()
    manager.password_helper.hash = MagicMock(return_value="hashed")
    return manager


# ---------------------------------------------------------------------------
# Lock duration schedule (must stay byte-identical to MBK production)
# ---------------------------------------------------------------------------


class TestLockDurationFor:
    def test_threshold_gives_1_min(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold) == timedelta(minutes=1)

    def test_threshold_plus_1_gives_5_min(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 1) == timedelta(minutes=5)

    def test_threshold_plus_2_gives_15_min(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 2) == timedelta(minutes=15)

    def test_threshold_plus_3_gives_1_hour(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 3) == timedelta(hours=1)

    def test_threshold_plus_4_gives_24_hours(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 4) == timedelta(hours=24)

    def test_large_count_clamps_to_24_hours(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 99) == timedelta(hours=24)


# ---------------------------------------------------------------------------
# Failure counter increments below threshold; lock applies AT threshold
# ---------------------------------------------------------------------------


class TestFailureCounterIncrement:
    @pytest.mark.asyncio
    async def test_below_threshold_no_lock(self) -> None:
        user = _make_user(failed_login_count=0)
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=None,
        ):
            for _ in range(settings.lockout_threshold - 1):
                # Simulate a fresh attempt — the user mock state is updated
                # via the mapping returned by record_failed_login.
                result = await manager.authenticate(_make_credentials())
                assert result is None
                # Mirror persistence onto the in-memory user so the next
                # call sees the incremented counter.
                update = manager.user_db.update.call_args[0][1]
                user.failed_login_count = update["failed_login_count"]
                user.last_failed_login_at = update["last_failed_login_at"]

            # No lock applied yet at count=threshold-1.
            last_call_kwargs = manager.user_db.update.call_args[0][1]
            assert "locked_until" not in last_call_kwargs

    @pytest.mark.asyncio
    async def test_threshold_attempt_triggers_lock(self) -> None:
        user = _make_user(failed_login_count=settings.lockout_threshold - 1)
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=None,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is None
        update = manager.user_db.update.call_args[0][1]
        assert "locked_until" in update
        assert update["failed_login_count"] == settings.lockout_threshold
        # First lock is 1 minute exactly (sub-second drift OK).
        delta = update["locked_until"] - datetime.now(tz=timezone.utc)
        assert timedelta(seconds=58) < delta < timedelta(seconds=62)


# ---------------------------------------------------------------------------
# Lock persists with correct password
# ---------------------------------------------------------------------------


class TestLockPersistsWithCorrectPassword:
    @pytest.mark.asyncio
    async def test_locked_account_rejects_correct_password(self) -> None:
        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        user = _make_user(
            failed_login_count=settings.lockout_threshold,
            locked_until=future,
        )
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is None
        # No DB update on a locked-attempt rejection.
        manager.user_db.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_expired_lock_allows_correct_password(self) -> None:
        past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
        user = _make_user(
            failed_login_count=settings.lockout_threshold,
            locked_until=past,
        )
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is user


# ---------------------------------------------------------------------------
# Locked attempts emit LOGIN_BLOCKED_LOCKED auth events
# ---------------------------------------------------------------------------


class TestLockedAttemptEmitsAuditEvent:
    @pytest.mark.asyncio
    async def test_locked_attempt_writes_login_blocked_locked(self) -> None:
        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        user = _make_user(
            failed_login_count=settings.lockout_threshold,
            locked_until=future,
        )
        manager = _make_manager(user)

        captured_events: list[str] = []

        async def _capture_emit(*, db, user_id=None, **kwargs):  # noqa: ANN001
            captured_events.append(AuthEventType.LOGIN_BLOCKED_LOCKED)

        with patch("app.core.auth.emit_locked_login_event", new=_capture_emit):
            with patch(
                "fastapi_users.BaseUserManager.authenticate",
                new_callable=AsyncMock,
                return_value=user,
            ):
                await manager.authenticate(_make_credentials())

        assert AuthEventType.LOGIN_BLOCKED_LOCKED in captured_events


# ---------------------------------------------------------------------------
# Successful login resets counter
# ---------------------------------------------------------------------------


class TestSuccessfulLoginResetsCounter:
    @pytest.mark.asyncio
    async def test_success_after_3_failures_clears_counter(self) -> None:
        user = _make_user(failed_login_count=3)
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is user
        update = manager.user_db.update.call_args[0][1]
        assert update["failed_login_count"] == 0
        assert update["last_failed_login_at"] is None
        assert update["locked_until"] is None

    @pytest.mark.asyncio
    async def test_success_with_zero_count_skips_update(self) -> None:
        user = _make_user(failed_login_count=0, locked_until=None)
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is user
        manager.user_db.update.assert_not_called()


# ---------------------------------------------------------------------------
# Lock escalation on repeat failures
# ---------------------------------------------------------------------------


class TestLockEscalation:
    @pytest.mark.asyncio
    async def test_post_expiry_failure_gives_5min_lock(self) -> None:
        """After lock expires and one more failure, the lock must be 5min."""
        user = _make_user(failed_login_count=settings.lockout_threshold)
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=None,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is None
        update = manager.user_db.update.call_args[0][1]
        assert update["failed_login_count"] == settings.lockout_threshold + 1
        delta = update["locked_until"] - datetime.now(tz=timezone.utc)
        assert timedelta(minutes=5) - timedelta(seconds=2) < delta
        assert delta < timedelta(minutes=5) + timedelta(seconds=2)


# ---------------------------------------------------------------------------
# 24-hour auto-reset of stale failure counter
# ---------------------------------------------------------------------------


class TestAutoReset:
    @pytest.mark.asyncio
    async def test_stale_counter_resets_and_login_succeeds(self) -> None:
        stale_time = datetime.now(tz=timezone.utc) - timedelta(
            hours=settings.lockout_autoreset_hours + 1,
        )
        user = _make_user(
            failed_login_count=3,
            last_failed_login_at=stale_time,
            locked_until=None,
        )
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is user
        # First update is the auto-reset.
        first_update = manager.user_db.update.call_args_list[0][0][1]
        assert first_update["failed_login_count"] == 0
        assert first_update["last_failed_login_at"] is None
        assert first_update["locked_until"] is None

    @pytest.mark.asyncio
    async def test_recent_failure_does_not_reset(self) -> None:
        recent_time = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        user = _make_user(
            failed_login_count=3,
            last_failed_login_at=recent_time,
            locked_until=None,
        )
        manager = _make_manager(user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=None,
        ):
            await manager.authenticate(_make_credentials())

        # No auto-reset; the only update is the failure increment.
        assert manager.user_db.update.call_count == 1
        update = manager.user_db.update.call_args[0][1]
        assert update["failed_login_count"] == 4


# ---------------------------------------------------------------------------
# Unknown email — response indistinguishable from locked
# ---------------------------------------------------------------------------


class TestUnknownEmailIndistinguishable:
    @pytest.mark.asyncio
    async def test_unknown_email_returns_none(self) -> None:
        manager = _make_manager(None)

        result = await manager.authenticate(_make_credentials(email="ghost@example.com"))
        assert result is None


# ---------------------------------------------------------------------------
# check_account_not_locked dependency (early reject at route level)
# ---------------------------------------------------------------------------


class TestCheckAccountNotLocked:
    @pytest.mark.asyncio
    async def test_locked_account_returns_429_with_generic_body(self) -> None:
        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        locked_user = _make_user(locked_until=future)

        mock_db = MagicMock()
        credentials = _make_credentials()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=locked_user,
        ):
            with pytest.raises(HTTPException) as exc:
                await check_account_not_locked(credentials=credentials, db=mock_db)

        assert exc.value.status_code == 429
        assert exc.value.detail == RATE_LIMIT_GENERIC_DETAIL

    @pytest.mark.asyncio
    async def test_unlocked_account_does_not_raise(self) -> None:
        unlocked_user = _make_user(locked_until=None)
        mock_db = MagicMock()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=unlocked_user,
        ):
            await check_account_not_locked(credentials=_make_credentials(), db=mock_db)

    @pytest.mark.asyncio
    async def test_unknown_email_does_not_raise(self) -> None:
        mock_db = MagicMock()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=None,
        ):
            await check_account_not_locked(
                credentials=_make_credentials(email="ghost@example.com"),
                db=mock_db,
            )

    @pytest.mark.asyncio
    async def test_expired_lock_does_not_raise(self) -> None:
        past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
        user = _make_user(locked_until=past)
        mock_db = MagicMock()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=user,
        ):
            await check_account_not_locked(credentials=_make_credentials(), db=mock_db)


# ---------------------------------------------------------------------------
# Per-IP limiter still fires independently of account lockout
# ---------------------------------------------------------------------------


class TestPerIpLimitComposesWithAccountLockout:
    def test_ip_limiter_threshold_is_independent(self) -> None:
        """Per-IP limit (10/5min) is independent of account-lockout threshold (5)."""
        limiter = RateLimiter(
            max_attempts=settings.login_rate_limit_threshold,
            window_seconds=settings.login_rate_limit_window_seconds,
        )
        for _ in range(settings.login_rate_limit_threshold):
            limiter.check("1.2.3.4")

        with pytest.raises(HTTPException) as exc:
            limiter.check("1.2.3.4")

        assert exc.value.status_code == 429
        assert exc.value.detail == RATE_LIMIT_GENERIC_DETAIL
