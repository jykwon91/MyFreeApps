"""Shared :class:`PlatformBaseUserManager` for fastapi-users-based apps.

Apps subclass this to inherit the lockout-aware password authentication,
TOTP gating on the standard JWT login path, and HIBP password validation
without re-implementing them per-app. App-specific concerns (e.g.
seeding an organization on registration, sending app-specific emails,
logging events with app-specific metadata) stay in the subclass.

Subclasses MUST set the following class attributes (typically pulled
from the app's ``settings``):

  * ``reset_password_token_secret``
  * ``verification_token_secret``
  * ``lockout_threshold`` — defaults to 5
  * ``lockout_autoreset_hours`` — defaults to 24
  * ``hibp_enabled`` — defaults to True
  * ``min_password_length`` — defaults to 12
  * ``seed_admin_email`` — defaults to "" (no reservation). Multi-user
    apps that seed a platform admin at boot set this to
    ``settings.seed_admin_email`` so the address can never be claimed
    through public registration (see
    ``platform_shared.services.seed_admin_service``).

Subclasses MUST override:

  * ``on_after_register`` — for app-specific seed data + verification dispatch
  * ``on_after_request_verify`` — to actually deliver the verification email
  * ``on_after_forgot_password`` — to deliver the reset email

Subclasses MAY override:

  * ``on_after_reset_password`` — e.g. to disable TOTP after password reset
  * ``on_after_verify`` — e.g. to log EMAIL_VERIFY_SUCCESS

The shared ``authenticate`` enforces account-level lockout, blocks
unverified users (so a token cannot be issued via the standard
``/auth/jwt/login`` route), and blocks TOTP-enabled users (so they're
forced through the dedicated ``/auth/totp/login`` route).
``authenticate_password`` is the password-only escape hatch the TOTP
login endpoint uses to bypass the TOTP gate (it still enforces lockout).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Generic, Optional, TypeVar, Union

from fastapi import Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import (
    BaseUserManager,
    InvalidPasswordException,
    UUIDIDMixin,
    exceptions,
    models,
    schemas,
)

from platform_shared.auth.session_invalidation import session_cutoff_now
from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.account_lockout import (
    autoreset_update_if_stale,
    emit_locked_login_event,
    is_locked as account_is_locked,
    record_failed_login,
    record_successful_login_update,
)
from platform_shared.services.auth_event_service import log_auth_event
from platform_shared.services.hibp_service import HIBPCheckError, is_password_pwned
from platform_shared.services.seed_admin_service import is_reserved_seed_email

logger = logging.getLogger(__name__)


UP = TypeVar("UP")


_LOCKOUT_FIELDS = ["failed_login_count", "last_failed_login_at", "locked_until"]


class PlatformBaseUserManager(
    UUIDIDMixin, BaseUserManager[UP, uuid.UUID], Generic[UP],
):
    """fastapi-users base with lockout, TOTP gate, and HIBP validation."""

    # Subclasses override (defaults are sane fallbacks for tests).
    lockout_threshold: int = 5
    lockout_autoreset_hours: int = 24
    hibp_enabled: bool = True
    min_password_length: int = 12
    seed_admin_email: str = ""

    async def create(
        self,
        user_create: schemas.UC,
        safe: bool = False,
        request: Optional[Request] = None,
    ) -> models.UP:
        """Reserve the seeded platform-admin address from registration.

        With open registration, whoever registers ``SEED_ADMIN_EMAIL``
        first would otherwise own the row the boot-time seed matches by
        email. The seed itself refuses to promote a non-seed-owned row
        (hash check), but reserving the address here closes the squat
        window entirely. Raises the same ``UserAlreadyExists`` the parent
        raises for a taken email — indistinguishable, no enumeration
        signal.
        """
        if is_reserved_seed_email(
            getattr(user_create, "email", ""), self.seed_admin_email,
        ):
            raise exceptions.UserAlreadyExists()
        return await super().create(user_create, safe=safe, request=request)

    async def authenticate(
        self, credentials: OAuth2PasswordRequestForm,
    ) -> Optional[models.UP]:
        """Authenticate a user with account-level lockout enforcement.

        Layers on top of the standard fastapi-users authenticate():
        1. Look up the user by email; unknown email → log LOGIN_FAILURE
           with PII-safe metadata (domain only) and return None.
        2. If the account is locked → emit LOGIN_BLOCKED_LOCKED and reject
           without checking the password.
        3. Auto-reset stale failure counter (no activity in >24 h).
        4. Delegate to parent for password verification.
        5. On failure: increment counter, apply exponential lock at threshold.
        6. On success: clear counter and lock state, unless the user has 2FA,
           whose count clears only once the code has passed too.
        7. Block unverified users (LOGIN_BLOCKED_UNVERIFIED).
        8. Block TOTP-enabled users — they must use /auth/totp/login.
        9. Log LOGIN_SUCCESS for the standard JWT path only.
        """
        db = self.user_db.session

        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            # Unknown email — mimic parent's timing mitigation.
            self.password_helper.hash(credentials.password)
            email_domain = (
                credentials.username.split("@", 1)[-1]
                if "@" in credentials.username
                else ""
            )
            await log_auth_event(
                db,
                event_type=AuthEventType.LOGIN_FAILURE,
                user_id=None,
                succeeded=False,
                metadata={"email_domain": email_domain, "reason": "unknown_email"},
            )
            return None

        now = datetime.now(tz=timezone.utc)

        if account_is_locked(user, now=now):
            logger.info(
                "Login rejected for locked account user_id=%s (locked until %s)",
                user.id, user.locked_until,
            )
            await emit_locked_login_event(db=db, user_id=user.id)
            return None

        await self.reset_stale_failed_logins(user)

        result = await super().authenticate(credentials)

        if result is None:
            await self._count_failed_login(user, reason="bad_password", now=now)
            return None

        # A password alone doesn't finish a 2FA login, or anyone who knows it could
        # keep clearing the count between guesses at the code.
        if not getattr(result, "totp_enabled", False):
            await self.clear_failed_logins(result)

        # Block unverified users from the standard JWT login.
        # Defense-in-depth alongside `current_active_user(verified=True)`.
        if not result.is_verified:
            await log_auth_event(
                db,
                event_type=AuthEventType.LOGIN_BLOCKED_UNVERIFIED,
                user_id=result.id,
                succeeded=False,
            )
            return None

        # Block TOTP-enabled users — they must use /auth/totp/login,
        # which calls authenticate_password() to bypass this gate.
        if getattr(result, "totp_enabled", False):
            return None

        await log_auth_event(
            db, event_type=AuthEventType.LOGIN_SUCCESS,
            user_id=result.id, succeeded=True,
        )
        return result

    async def authenticate_password(
        self,
        credentials: OAuth2PasswordRequestForm,
        request: Optional[Request] = None,
    ) -> Optional[models.UP]:
        """Password-only authenticate (no TOTP gate, no verified gate).

        Used by the unified ``/auth/totp/login`` endpoint, which performs
        TOTP validation + verified-user check itself after this returns.
        Re-runs the lockout flow (lookup → lock check → auto-reset →
        password verify → counter update) so the 2FA login path enjoys the
        same brute-force protection as the standard one. A user with 2FA keeps
        their count here; the route clears it once the code has passed.

        Pass ``request`` so ``emit_locked_login_event`` captures
        ``ip_address`` and ``user_agent`` in the audit row.

        Calling this from anywhere else bypasses 2FA — don't.
        """
        db = self.user_db.session

        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            self.password_helper.hash(credentials.password)
            return None

        now = datetime.now(tz=timezone.utc)

        if account_is_locked(user, now=now):
            logger.info(
                "TOTP login rejected for locked account user_id=%s (locked until %s)",
                user.id, user.locked_until,
            )
            await emit_locked_login_event(db=db, user_id=user.id, request=request)
            return None

        await self.reset_stale_failed_logins(user)

        result = await super().authenticate(credentials)

        if result is None:
            await self._count_failed_login(user, reason="bad_password", now=now)
            return None

        # A password alone doesn't finish a 2FA login, or anyone who knows it could
        # keep clearing the count between guesses at the code.
        if not getattr(result, "totp_enabled", False):
            await self.clear_failed_logins(result)

        return result

    async def reset_stale_failed_logins(self, user: models.UP) -> None:
        """Forget old failures, so a typo months ago doesn't count toward a lockout."""
        autoreset = autoreset_update_if_stale(
            user, now=datetime.now(tz=timezone.utc), autoreset_hours=self.lockout_autoreset_hours,
        )
        if autoreset is not None:
            await self.user_db.update(user, autoreset)
            user.failed_login_count = 0
            user.last_failed_login_at = None
            user.locked_until = None

    async def is_locked_now(self, user: models.UP) -> bool:
        """Reread the lockout under a row lock, which the caller's commit releases.

        Guesses sent together all pass a check made when the request began, so
        anything acting on a guess has to ask again once it has checked it.
        """
        await self.user_db.session.refresh(user, _LOCKOUT_FIELDS, with_for_update=True)
        return account_is_locked(user, now=datetime.now(tz=timezone.utc))

    async def count_failed_password(self, user: models.UP) -> None:
        """Count a wrong password given while signed in toward the login lockout."""
        await self._count_failed_login(
            user, reason="bad_password", now=datetime.now(tz=timezone.utc),
        )

    async def count_failed_second_factor(self, user: models.UP) -> None:
        """Count a wrong 2FA code toward the same lockout as a wrong password."""
        await self._count_failed_login(
            user, reason="bad_totp", now=datetime.now(tz=timezone.utc),
        )

    async def clear_failed_logins(self, user: models.UP) -> None:
        """Clear the lockout count once the whole login has succeeded."""
        clear_update = record_successful_login_update(user)
        if clear_update is not None:
            await self.user_db.update(user, clear_update)

    async def _count_failed_login(
        self, user: models.UP, *, reason: str, now: datetime,
    ) -> None:
        db = self.user_db.session
        # Lock and reread until ``user_db.update`` commits. Parallel guesses would
        # otherwise all count from the same stale value and undercount.
        await db.refresh(user, _LOCKOUT_FIELDS, with_for_update=True)
        update = await record_failed_login(
            user, db=db, user_id=user.id,
            lockout_threshold=self.lockout_threshold,
            metadata={"reason": reason}, now=now,
        )
        if "locked_until" in update:
            logger.warning(
                "Account locked: user_id=%s until %s (consecutive failures: %d)",
                user.id, update["locked_until"], update["failed_login_count"],
            )
        await self.user_db.update(user, update)

    async def _update(self, user: UP, update_dict: dict[str, Any]) -> UP:
        """End every existing session when the password changes.

        Here rather than in ``on_after_reset_password``, which subclasses override
        without calling ``super()``. Password reset passes through this method.

        The cutoff is taken after validating and hashing, which can take seconds.
        Taken before, a login with the old password during that wait would issue
        a token newer than the cutoff, which would survive the change.
        """
        password = update_dict.get("password")
        if password is None:
            return await super()._update(user, update_dict)
        await self.validate_password(password, user)
        hashed_password = self.password_helper.hash(password)
        others = {field: value for field, value in update_dict.items() if field != "password"}
        return await super()._update(
            user,
            {**others, "hashed_password": hashed_password, "auth_valid_after": session_cutoff_now()},
        )

    async def validate_password(
        self, password: str, user: Union[schemas.UC, models.UP],
    ) -> None:
        """Validate password length + HIBP breach status.

        Fails open on HIBP outage with a WARNING log so registrations and
        password resets aren't blocked by an unrelated third-party outage.
        Subclasses can override for app-specific rules; call ``super()``
        first to keep the length + HIBP checks.
        """
        if len(password) < self.min_password_length:
            raise InvalidPasswordException(
                reason=(
                    f"Password must be at least {self.min_password_length} characters."
                ),
            )

        if self.hibp_enabled:
            try:
                if await is_password_pwned(password):
                    raise InvalidPasswordException(
                        reason=(
                            "This password has appeared in a known data breach. "
                            "Please pick a different one. "
                            "(We checked anonymously — your password never left our server in plaintext.)"
                        ),
                    )
            except HIBPCheckError:
                # Fail-open: a HIBP outage must not block registrations or
                # password resets. The narrow window where a breached password
                # slips through is the deliberate tradeoff vs no signups
                # whenever HIBP is down.
                logger.warning(
                    "HIBP check failed; accepting password without breach check",
                    exc_info=True,
                )
