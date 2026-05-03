"""Account-level lockout policy — pure decision logic, no DB / ORM coupling.

Promoted from MyBookkeeper's ``app.core.auth.UserManager.authenticate``
inline lockout block (PR M7 — final M-series PR of the shared-backend
migration). The MBK version mixed the lockout policy decisions
(increment counter, apply exponential lock at threshold, auto-reset stale
counters) with ``fastapi-users`` plumbing (``self.user_db.update`` calls,
the ``log_auth_event`` emission, ``credentials.username`` parsing).

This module keeps ONLY the policy half:

  * :func:`lock_duration_for` — exponential backoff schedule
    (1min → 5min → 15min → 1h → 24h) keyed on the consecutive-failure
    count. The schedule is byte-identical to MBK production; production
    users depend on this exact cadence.
  * :func:`record_failed_login` — given the current account state, decide
    the next ``failed_login_count`` / ``locked_until`` /
    ``last_failed_login_at`` values, write the
    ``LOGIN_FAILURE`` / ``LOGIN_BLOCKED_LOCKED`` audit row, and return
    the update dict for the caller to persist.
  * :func:`record_successful_login` — clear the counter and lock if any.
  * :func:`is_locked` — check ``locked_until`` against now.
  * :func:`apply_autoreset_if_stale` — if the counter is non-zero and the
    last failure was more than ``autoreset_hours`` ago, return the reset
    update dict so the caller can persist before processing this attempt.

Caller wiring lives in each app's ``app.core.auth`` (MBK is the only
caller today). The session, the User row, and the policy thresholds are
all caller-supplied — this module does not import ``app.*`` anywhere.

Design notes:

  * The shared functions return an "update dict" rather than mutating
    the account in-place. That mirrors how ``fastapi-users``'
    ``user_db.update`` is invoked in MBK and lets the caller decide
    whether to persist via ORM, raw SQL, or in-memory mutation.
  * Functions optionally update the in-memory account attributes too
    (since SQLAlchemy ORM rows in MBK retain the post-update values
    used in subsequent decisions in the same request). Pure-function
    callers just read the returned dict and ignore the side-effect.
  * Auth-event emission goes through an injected ``log_event`` callable
    (default: :func:`platform_shared.services.auth_event_service.log_auth_event`)
    so test seams and per-app overrides are easy.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional, Protocol, runtime_checkable

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.auth_event_service import log_auth_event


# ---------------------------------------------------------------------------
# Defaults — MUST stay byte-identical with MBK production
# ---------------------------------------------------------------------------

#: Default consecutive-failure threshold at which the first lock applies.
#: MBK production setting; new apps may pass their own value.
DEFAULT_LOCKOUT_THRESHOLD: int = 5

#: Default hours of inactivity before a non-zero failure counter auto-resets.
DEFAULT_AUTORESET_HOURS: int = 24

#: Default exponential lock-duration schedule, in order:
#:
#:    failed_count == threshold      -> 1 minute
#:    failed_count == threshold + 1  -> 5 minutes
#:    failed_count == threshold + 2  -> 15 minutes
#:    failed_count == threshold + 3  -> 1 hour
#:    failed_count >= threshold + 4  -> 24 hours
#:
#: This cadence is in production at MBK. Bumping any value would either
#: lock real users out longer than they expect or shorten the window an
#: attacker has to give up. Keep it stable across apps unless you're
#: shipping a new product and willing to bump every existing user.
DEFAULT_LOCK_DURATIONS: list[timedelta] = [
    timedelta(minutes=1),
    timedelta(minutes=5),
    timedelta(minutes=15),
    timedelta(hours=1),
    timedelta(hours=24),
]


# ---------------------------------------------------------------------------
# Protocol — minimum shape the shared lockout policy needs to read/mutate
# ---------------------------------------------------------------------------

@runtime_checkable
class LockoutAccount(Protocol):
    """Structural type for any account row that can be locked.

    Apps just need a row with these three columns. MBK's
    ``app.models.user.user.User`` satisfies this without changes (and
    so does any future app's user model that copies the same three
    columns). ``id`` is read only when ``user_id_for_event`` is left
    as ``None``, so an unsaved row without an ``id`` is also valid.
    """

    failed_login_count: int
    locked_until: Optional[datetime]
    last_failed_login_at: Optional[datetime]


# Type alias so call sites read clearly.
LogEvent = Callable[..., Awaitable[None]]


# ---------------------------------------------------------------------------
# Pure helpers — no DB, no logging
# ---------------------------------------------------------------------------

def lock_duration_for(
    failed_count: int,
    *,
    threshold: int = DEFAULT_LOCKOUT_THRESHOLD,
    schedule: Optional[list[timedelta]] = None,
) -> timedelta:
    """Return the lock duration for a given consecutive-failure count.

    The schedule is keyed off ``failed_count - threshold``: at the
    threshold itself the first entry applies, the next failure picks
    the second entry, and so on. Counts above the schedule length clamp
    to the last entry (which is 24h by default — caps the worst-case
    lockout duration so an attacker tying up an account forever cannot
    DoS the legitimate user indefinitely).

    A ``failed_count`` BELOW the threshold raises ``ValueError`` —
    callers must check the threshold first; they should not be asking
    for a lock duration when no lock applies.
    """
    if failed_count < threshold:
        raise ValueError(
            f"lock_duration_for called with failed_count={failed_count} below "
            f"threshold={threshold} — caller should check threshold first",
        )
    table = schedule if schedule is not None else DEFAULT_LOCK_DURATIONS
    if not table:
        raise ValueError("lock duration schedule must not be empty")
    index = min(failed_count - threshold, len(table) - 1)
    return table[index]


def is_locked(
    account: LockoutAccount,
    *,
    now: Optional[datetime] = None,
) -> bool:
    """Return ``True`` iff ``account.locked_until`` is in the future.

    ``now`` is injectable for deterministic tests; defaults to
    ``datetime.now(tz=timezone.utc)``.
    """
    locked_until = account.locked_until
    if locked_until is None:
        return False
    reference = now if now is not None else datetime.now(tz=timezone.utc)
    return locked_until > reference


def _is_stale(
    account: LockoutAccount,
    *,
    now: datetime,
    autoreset_hours: int,
) -> bool:
    """Return ``True`` iff the failure counter should auto-reset.

    A counter is "stale" when it's non-zero AND the last failure happened
    more than ``autoreset_hours`` ago. The aim is that a single typo six
    months ago should not compound forever.
    """
    if account.failed_login_count <= 0:
        return False
    last = account.last_failed_login_at
    if last is None:
        return False
    return (now - last).total_seconds() > autoreset_hours * 3600


# ---------------------------------------------------------------------------
# Decision functions — return persistable update dicts, emit audit events
# ---------------------------------------------------------------------------

def autoreset_update_if_stale(
    account: LockoutAccount,
    *,
    now: Optional[datetime] = None,
    autoreset_hours: int = DEFAULT_AUTORESET_HOURS,
) -> Optional[dict[str, Any]]:
    """Return the auto-reset update dict if the counter is stale, else ``None``.

    Caller is expected to persist the dict (e.g. ``await user_db.update(user, dict)``)
    and then ALSO mirror the values onto the in-memory account so the
    next decision in the same request sees the reset state. This helper
    deliberately does NOT mutate ``account`` so it stays pure.
    """
    reference = now if now is not None else datetime.now(tz=timezone.utc)
    if not _is_stale(account, now=reference, autoreset_hours=autoreset_hours):
        return None
    return {
        "failed_login_count": 0,
        "last_failed_login_at": None,
        "locked_until": None,
    }


async def record_failed_login(
    account: LockoutAccount,
    *,
    db: AsyncSession,
    user_id: Optional[uuid.UUID],
    lockout_threshold: int = DEFAULT_LOCKOUT_THRESHOLD,
    lock_durations: Optional[list[timedelta]] = None,
    metadata: Optional[dict[str, Any]] = None,
    now: Optional[datetime] = None,
    log_event: LogEvent = log_auth_event,
) -> dict[str, Any]:
    """Compute the next lockout state after a failed password attempt.

    Returns the update dict the caller must persist
    (``failed_login_count``, ``last_failed_login_at``, and
    ``locked_until`` IFF the threshold was hit). Also writes a single
    ``LOGIN_FAILURE`` audit row.

    Note on audit semantics — to preserve byte-identical behaviour with
    MBK's pre-M7 production code, this helper emits ONLY
    ``LOGIN_FAILURE`` even when the lock is freshly applied. The
    ``LOGIN_BLOCKED_LOCKED`` event type is reserved for SUBSEQUENT
    attempts that hit an already-locked account (callers route those
    through :func:`emit_locked_login_event` before invoking this
    function). Re-using `LOGIN_BLOCKED_LOCKED` at the lock-application
    moment would double the audit-row volume on the threshold-crossing
    attempt and break dashboards calibrated to the existing rate.

    Parameters that callers may override:

      * ``lockout_threshold`` — number of consecutive failures that
        triggers the first lock. Default 5 (MBK production).
      * ``lock_durations`` — exponential backoff schedule. Default
        :data:`DEFAULT_LOCK_DURATIONS`.
      * ``metadata`` — extra key/values written into the LOGIN_FAILURE
        event row (for example ``{"reason": "bad_password"}``). The
        helper does NOT add a default reason — callers pass what they
        want.
      * ``user_id`` — written into the audit row. Pass ``None`` for
        unknown-email failures (so the row stays PII-safe).
    """
    reference = now if now is not None else datetime.now(tz=timezone.utc)
    new_count = account.failed_login_count + 1
    update: dict[str, Any] = {
        "failed_login_count": new_count,
        "last_failed_login_at": reference,
    }

    if new_count >= lockout_threshold:
        duration = lock_duration_for(
            new_count,
            threshold=lockout_threshold,
            schedule=lock_durations,
        )
        update["locked_until"] = reference + duration

    await log_event(
        db,
        event_type=AuthEventType.LOGIN_FAILURE,
        user_id=user_id,
        succeeded=False,
        metadata=metadata or {},
    )

    return update


def record_successful_login_update(
    account: LockoutAccount,
) -> Optional[dict[str, Any]]:
    """Return the clear-counters update dict, or ``None`` if nothing to clear.

    A successful login MUST reset ``failed_login_count``,
    ``last_failed_login_at``, and ``locked_until``. If they're already
    cleared, the helper returns ``None`` so the caller can skip the
    write entirely.
    """
    if account.failed_login_count == 0 and account.locked_until is None:
        return None
    return {
        "failed_login_count": 0,
        "last_failed_login_at": None,
        "locked_until": None,
    }


async def emit_locked_login_event(
    *,
    db: AsyncSession,
    user_id: Optional[uuid.UUID],
    request: Optional[Request] = None,
    log_event: LogEvent = log_auth_event,
) -> None:
    """Emit a ``LOGIN_BLOCKED_LOCKED`` audit row for an already-locked account.

    Used when an attempt comes in for an account whose ``locked_until``
    is still in the future — we reject without touching the password
    helper, but still log the attempt so SOC / admin tooling can see it.

    Pass ``request`` to capture ``ip_address`` and ``user_agent`` in the
    audit row — critical for per-IP brute-force analysis on locked accounts.
    When called from code paths that don't have a ``Request`` available
    (e.g. the standard fastapi-users JWT login path), omit the argument and
    the fields will be NULL.
    """
    await log_event(
        db,
        event_type=AuthEventType.LOGIN_BLOCKED_LOCKED,
        user_id=user_id,
        request=request,
        succeeded=False,
    )


__all__ = [
    "DEFAULT_LOCKOUT_THRESHOLD",
    "DEFAULT_AUTORESET_HOURS",
    "DEFAULT_LOCK_DURATIONS",
    "LockoutAccount",
    "LogEvent",
    "lock_duration_for",
    "is_locked",
    "autoreset_update_if_stale",
    "record_failed_login",
    "record_successful_login_update",
    "emit_locked_login_event",
]
