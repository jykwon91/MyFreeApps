"""Lockout and audit writes for sign-ins and sensitive changes, shared by every app.

Each method is one transaction: it locks the user row, rereads the lockout, decides,
writes the count and the audit rows together, and releases the row when it returns.
Guesses sent together therefore wait for each other and can't undercount, and a
refusal's rows are saved even though the route goes on to raise.

Methods return an outcome rather than raising, because raising inside the transaction
would discard those rows. Decide from the outcome, never from a ``user`` loaded earlier
in the request: that copy doesn't see these writes.
"""
import logging
import uuid
from collections.abc import Awaitable, Callable, Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.repositories.user_repo import lock_by_id
from platform_shared.services.account_lockout import (
    DEFAULT_AUTORESET_HOURS,
    DEFAULT_LOCKOUT_THRESHOLD,
    autoreset_update_if_stale,
    emit_locked_login_event,
    is_locked,
    record_failed_login,
    record_successful_login_update,
)
from platform_shared.services.auth_event_service import log_auth_event
from platform_shared.services.guard_outcome import GuardOutcome

logger = logging.getLogger(__name__)

_LOCKOUT_FIELDS = ("failed_login_count", "last_failed_login_at", "locked_until")


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _apply_lockout_update(user: Any, update: Mapping[str, Any]) -> None:
    for field in _LOCKOUT_FIELDS:
        if field in update:
            setattr(user, field, update[field])


def _login_ends_with_the_password(user: Any) -> bool:
    """A password alone doesn't finish a refused login or one still owed a 2FA code, so
    it mustn't clear the count: anyone who knows it could clear it between guesses."""
    return user.is_active and user.is_verified and not user.totp_enabled


@dataclass(frozen=True)
class AccountGuardService:
    user_model: Any
    unit_of_work_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]]
    lockout_threshold: int = DEFAULT_LOCKOUT_THRESHOLD
    lockout_autoreset_hours: int = DEFAULT_AUTORESET_HOURS

    async def begin_attempt(self, user_id: uuid.UUID, *, request: Request | None = None) -> GuardOutcome:
        """Refuse a locked account, and forget failures old enough not to count."""
        async with self.unit_of_work_factory() as db:
            user = await self._lock(db, user_id)
            if is_locked(user, now=_now()):
                await emit_locked_login_event(db=db, user_id=user_id, request=request)
                return GuardOutcome.LOCKED
            stale = autoreset_update_if_stale(user, now=_now(), autoreset_hours=self.lockout_autoreset_hours)
            if stale is not None:
                _apply_lockout_update(user, stale)
            return GuardOutcome.ALLOWED

    async def record_password_attempt(
        self,
        user_id: uuid.UUID,
        *,
        correct: bool,
        finishes_login: bool,
        request: Request | None = None,
    ) -> GuardOutcome:
        """Asked whichever way the guess went, so once locked a right guess and a wrong
        one get the same answer."""
        async with self.unit_of_work_factory() as db:
            user = await self._lock(db, user_id)
            if is_locked(user, now=_now()):
                await emit_locked_login_event(db=db, user_id=user_id, request=request)
                return GuardOutcome.LOCKED
            if not correct:
                await self._count_failure(db, user, reason="bad_password")
                return GuardOutcome.WRONG
            if finishes_login and _login_ends_with_the_password(user):
                self._clear(user)
            return GuardOutcome.ALLOWED

    async def record_code_attempt(
        self,
        user_id: uuid.UUID,
        *,
        valid: bool,
        success_events: Sequence[AuthEventType] = (),
        expect_totp_enabled: bool | None = None,
        request: Request | None = None,
    ) -> GuardOutcome:
        """The outcome of a 2FA code that has already been checked.

        ``expect_totp_enabled`` is the state the code was checked against. If that has
        changed, a rejected code is a double press rather than a guess, so it isn't counted.
        """
        async with self.unit_of_work_factory() as db:
            user = await self._lock(db, user_id)
            if is_locked(user, now=_now()):
                await emit_locked_login_event(db=db, user_id=user_id, request=request)
                return GuardOutcome.LOCKED
            if valid:
                self._clear(user)
                await self._log_all(db, user_id, success_events, request)
                return GuardOutcome.ALLOWED
            if expect_totp_enabled is not None and user.totp_enabled != expect_totp_enabled:
                return GuardOutcome.STATE_CHANGED
            await self._count_failure(db, user, reason="bad_totp")
            await log_auth_event(
                db,
                event_type=AuthEventType.TOTP_VERIFY_FAILURE,
                user_id=user_id,
                request=request,
                succeeded=False,
            )
            return GuardOutcome.WRONG

    async def record_success(
        self,
        user_id: uuid.UUID,
        *,
        events: Sequence[AuthEventType],
        request: Request | None = None,
    ) -> None:
        """Clear the count and log, for a change the two-factor service has already made.

        A lock that landed since that change stays: it came from someone else's attempts.
        """
        async with self.unit_of_work_factory() as db:
            user = await self._lock(db, user_id)
            if not is_locked(user, now=_now()):
                self._clear(user)
            await self._log_all(db, user_id, events, request)

    async def spend_step_up_code(
        self,
        user_id: uuid.UUID,
        code: str,
        verify: Callable[[AsyncSession, uuid.UUID, str], Awaitable[bool]],
        *,
        request: Request | None = None,
    ) -> GuardOutcome:
        """Check a code before a sensitive action. A spent code stays spent if the action
        then fails or the account turns out to be locked."""
        async with self.unit_of_work_factory() as db:
            valid = await verify(db, user_id, code)
            user = await self._lock(db, user_id)
            if is_locked(user, now=_now()):
                await emit_locked_login_event(db=db, user_id=user_id, request=request)
                return GuardOutcome.LOCKED
            if not valid:
                await self._count_failure(db, user, reason="bad_totp")
                return GuardOutcome.WRONG
            return GuardOutcome.ALLOWED

    async def record_event(
        self,
        event_type: AuthEventType,
        *,
        user_id: uuid.UUID | None,
        succeeded: bool,
        request: Request | None = None,
        metadata: dict[str, str] | None = None,
    ) -> None:
        """Save one audit row now, for a path that goes on to refuse or return."""
        async with self.unit_of_work_factory() as db:
            await log_auth_event(
                db,
                event_type=event_type,
                user_id=user_id,
                request=request,
                succeeded=succeeded,
                metadata=metadata,
            )

    async def _lock(self, db: AsyncSession, user_id: uuid.UUID) -> Any:
        user = await lock_by_id(db, user_id, user_model=self.user_model)
        if user is None:
            raise ValueError("User not found")
        return user

    def _clear(self, user: Any) -> None:
        cleared = record_successful_login_update(user)
        if cleared is not None:
            _apply_lockout_update(user, cleared)

    async def _count_failure(self, db: AsyncSession, user: Any, *, reason: str) -> None:
        update = await record_failed_login(
            user,
            db=db,
            user_id=user.id,
            lockout_threshold=self.lockout_threshold,
            metadata={"reason": reason},
            now=_now(),
        )
        if "locked_until" in update:
            logger.warning(
                "Account locked: user_id=%s until %s (consecutive failures: %d)",
                user.id, update["locked_until"], update["failed_login_count"],
            )
        _apply_lockout_update(user, update)

    async def _log_all(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        events: Sequence[AuthEventType],
        request: Request | None,
    ) -> None:
        for event_type in events:
            await log_auth_event(db, event_type=event_type, user_id=user_id, request=request, succeeded=True)


__all__ = ["AccountGuardService"]
