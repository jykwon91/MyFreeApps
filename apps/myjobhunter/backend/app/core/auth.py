"""MyJobHunter authentication wiring (fastapi-users + custom UserManager).

Layered concerns ``UserManager.authenticate`` enforces, in order:
  * **Lockout (PR C3)** — block locked accounts before checking password.
  * **TOTP gate (this PR — C5)** — block standard JWT login for users who
    have 2FA enabled; they must use ``POST /auth/totp/login`` instead so
    we can validate the 6-digit code before issuing a token.

The lockout slice runs first so a TOTP-enabled user whose account is locked
never advances to the TOTP gate. The TOTP gate is the last check after a
successful password match — :meth:`authenticate_password` is the
password-only escape hatch the unified login endpoint uses to bypass it
(after which the endpoint validates the TOTP code itself).
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import (
    BaseUserManager,
    FastAPIUsers,
    InvalidPasswordException,
    UUIDIDMixin,
    exceptions,
    models,
)
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.account_lockout import (
    autoreset_update_if_stale,
    emit_locked_login_event,
    is_locked as account_is_locked,
    lock_duration_for,
    record_failed_login,
    record_successful_login_update,
)
from platform_shared.services.hibp_service import HIBPCheckError, is_password_pwned

from app.core.config import settings
from app.db.session import get_db
from app.models.user.user import User
from app.services.email.verification_email import send_verification_email
from app.services.system.auth_event_service import log_auth_event

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 12


def _lock_duration_for(failure_count: int) -> timedelta:
    """Thin wrapper around the shared lock_duration_for, keyed off MJH's
    configured ``lockout_threshold``. Kept module-level so tests can import it.
    """
    return lock_duration_for(failure_count, threshold=settings.lockout_threshold)


async def get_user_db(session: AsyncSession = Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.secret_key
    verification_token_secret = settings.secret_key

    async def authenticate(
        self, credentials: OAuth2PasswordRequestForm,
    ) -> Optional[models.UP]:
        """Authenticate with lockout + TOTP gate (PR C3 + C5).

        Layers on top of fastapi-users' standard ``authenticate``:

        1. Look up the user. Unknown email → log a PII-safe LOGIN_FAILURE
           (domain only) and return None.
        2. If the account is locked → emit ``LOGIN_BLOCKED_LOCKED`` and
           reject without checking the password.
        3. Auto-reset stale failure counter; delegate to parent; on bad
           password → increment counter + maybe apply lock; on success →
           clear counter and lock state, write LOGIN_SUCCESS.
        4. **TOTP gate (C5)** — if the authenticated user has ``totp_enabled``,
           return ``None`` so the standard ``/auth/jwt/login`` endpoint does
           NOT issue a token. The user has to use ``/auth/totp/login``.
        """
        db = self.user_db.session

        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
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
            user, now=now,
            autoreset_hours=settings.lockout_autoreset_hours,
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
                lockout_threshold=settings.lockout_threshold,
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

        # TOTP gate: block the standard login endpoint for 2FA-enabled users.
        # They must use POST /auth/totp/login, which calls
        # authenticate_password() below to skip this guard. We do NOT log a
        # LOGIN_SUCCESS event here — the dedicated /auth/totp/login endpoint
        # owns the audit trail for 2FA-enabled accounts (it logs both
        # TOTP_VERIFY_SUCCESS and LOGIN_SUCCESS once the code clears).
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
        """Authenticate with lockout enforcement but WITHOUT the TOTP gate.

        Used by the unified ``/auth/totp/login`` endpoint, which performs
        its own TOTP validation after this returns. We deliberately re-run
        the full lockout flow here (lookup → lock check → auto-reset →
        password verify → counter update) so the 2FA login path enjoys the
        same brute-force protection as the standard one.

        Pass ``request`` so that ``emit_locked_login_event`` can capture
        ``ip_address`` and ``user_agent`` in the audit row.

        Calling this from anywhere else bypasses 2FA — don't.
        """
        db = self.user_db.session

        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
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
                "TOTP login rejected for locked account user_id=%s (locked until %s)",
                user.id,
                user.locked_until,
            )
            await emit_locked_login_event(db=db, user_id=user.id, request=request)
            return None

        autoreset = autoreset_update_if_stale(
            user,
            now=now,
            autoreset_hours=settings.lockout_autoreset_hours,
        )
        if autoreset is not None:
            await self.user_db.update(user, autoreset)
            user.failed_login_count = 0
            user.last_failed_login_at = None
            user.locked_until = None

        result = await super().authenticate(credentials)

        if result is None:
            update = await record_failed_login(
                user,
                db=db,
                user_id=user.id,
                lockout_threshold=settings.lockout_threshold,
                metadata={"reason": "bad_password"},
                now=now,
            )
            await self.user_db.update(user, update)
            return None

        clear_update = record_successful_login_update(result)
        if clear_update is not None:
            await self.user_db.update(result, clear_update)

        return result

    async def validate_password(self, password: str, user: User | None = None) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise InvalidPasswordException(
                reason=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
            )

        if settings.hibp_enabled:
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
                logger.warning(
                    "HIBP check failed; accepting password without breach check",
                    exc_info=True,
                )

    async def on_after_register(
        self, user: User, request: Optional[Request] = None,
    ) -> None:
        """Trigger the verification email immediately after registration."""
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None,
    ) -> None:
        """Send verification email when a token is generated (registration or resend)."""
        success = send_verification_email(user.email, token)
        if success:
            logger.info("Verification email sent to user_id=%s", user.id)
        else:
            logger.warning("Failed to send verification email to user_id=%s", user.id)

    async def on_after_verify(
        self, user: User, request: Optional[Request] = None,
    ) -> None:
        logger.info("User verified: user_id=%s", user.id)


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=settings.secret_key,
        lifetime_seconds=settings.jwt_lifetime_seconds,
    )


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
current_active_user = fastapi_users.current_user(active=True, verified=True)
