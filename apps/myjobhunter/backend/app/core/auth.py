import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends
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
from app.services.system.auth_event_service import log_auth_event

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 12


def _lock_duration_for(failure_count: int) -> timedelta:
    """Return exponential lock duration based on consecutive failure count.

    Thin wrapper around the shared
    :func:`platform_shared.services.account_lockout.lock_duration_for`,
    keyed off MJH's configured ``lockout_threshold``. Kept as a
    module-level callable so tests can import it directly.
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
        """Authenticate with account-level lockout enforcement (PR C3).

        Layers on top of fastapi-users' standard ``authenticate``:

        1. Look up the user. Unknown email → log a PII-safe LOGIN_FAILURE
           (domain only) and return None.
        2. If the account is locked → emit ``LOGIN_BLOCKED_LOCKED`` and
           reject without checking the password.
        3. Auto-reset stale failure counter (no activity > autoreset
           window) so a six-month-old typo does not compound forever.
        4. Delegate to parent for password verification.
        5. On failure → increment counter, apply exponential lock at
           threshold, write LOGIN_FAILURE.
        6. On success → clear counter and lock state, write LOGIN_SUCCESS.
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
                "Login rejected for locked account %s (locked until %s)",
                user.email,
                user.locked_until,
            )
            await emit_locked_login_event(db=db, user_id=user.id)
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
            if "locked_until" in update:
                logger.warning(
                    "Account locked: %s until %s (consecutive failures: %d)",
                    user.email,
                    update["locked_until"],
                    update["failed_login_count"],
                )
            await self.user_db.update(user, update)
            return None

        clear_update = record_successful_login_update(result)
        if clear_update is not None:
            await self.user_db.update(result, clear_update)

        await log_auth_event(
            db,
            event_type=AuthEventType.LOGIN_SUCCESS,
            user_id=result.id,
            succeeded=True,
        )
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
                # Fail-open: a HIBP outage must not block registrations or
                # password resets. The narrow window where a breached password
                # slips through is preferable to "any HIBP downtime = no signups".
                logger.warning(
                    "HIBP check failed; accepting password without breach check",
                    exc_info=True,
                )


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
current_active_user = fastapi_users.current_user(active=True)
