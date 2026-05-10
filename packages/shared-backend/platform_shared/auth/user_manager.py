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

Subclasses MUST override:

  * ``on_after_register`` — for app-specific seed data + verification dispatch
  * ``on_after_request_verify`` — to actually deliver the verification email
  * ``on_after_forgot_password`` — to deliver the reset email

Subclasses MAY override:

  * ``on_after_reset_password`` — e.g. to disable TOTP after password reset
  * ``on_after_update`` — e.g. to log password-change auth events
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
from typing import Generic, Optional, TypeVar, Union

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

logger = logging.getLogger(__name__)


UP = TypeVar("UP")


class PlatformBaseUserManager(
    UUIDIDMixin, BaseUserManager[UP, uuid.UUID], Generic[UP],
):
    """fastapi-users base with lockout, TOTP gate, and HIBP validation."""

    # Subclasses override (defaults are sane fallbacks for tests).
    lockout_threshold: int = 5
    lockout_autoreset_hours: int = 24
    hibp_enabled: bool = True
    min_password_length: int = 12

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
        6. On success: clear counter and lock state.
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

        autoreset = autoreset_update_if_stale(
            user, now=now, autoreset_hours=self.lockout_autoreset_hours,
        )
        if autoreset is not None:
            await self.user_db.update(user, autoreset)
            user.failed_login_count = 0
            user.last_failed_login_at = None
            user.locked_until = None

        result = await super().authenticate(credentials)

        if result is None:
            update = await record_failed_login(
                user, db=db, user_id=user.id,
                lockout_threshold=self.lockout_threshold,
                metadata={"reason": "bad_password"}, now=now,
            )
            if "locked_until" in update:
                logger.warning(
                    "Account locked: user_id=%s until %s (consecutive failures: %d)",
                    user.id, update["locked_until"], update["failed_login_count"],
                )
            await self.user_db.update(user, update)
            return None

        clear_update = record_successful_login_update(result)
        if clear_update is not None:
            await self.user_db.update(result, clear_update)

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
        same brute-force protection as the standard one.

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

        autoreset = autoreset_update_if_stale(
            user, now=now, autoreset_hours=self.lockout_autoreset_hours,
        )
        if autoreset is not None:
            await self.user_db.update(user, autoreset)
            user.failed_login_count = 0
            user.last_failed_login_at = None
            user.locked_until = None

        result = await super().authenticate(credentials)

        if result is None:
            update = await record_failed_login(
                user, db=db, user_id=user.id,
                lockout_threshold=self.lockout_threshold,
                metadata={"reason": "bad_password"}, now=now,
            )
            if "locked_until" in update:
                logger.warning(
                    "Account locked: user_id=%s until %s (consecutive failures: %d)",
                    user.id, update["locked_until"], update["failed_login_count"],
                )
            await self.user_db.update(user, update)
            return None

        clear_update = record_successful_login_update(result)
        if clear_update is not None:
            await self.user_db.update(result, clear_update)

        return result

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
