"""MyJobHunter authentication wiring (fastapi-users + custom UserManager).

The lockout-aware ``authenticate`` / ``authenticate_password`` and
HIBP-validating ``validate_password`` live in
:class:`platform_shared.auth.user_manager.PlatformBaseUserManager`.
This module subclasses it to wire MJH-specific email senders + audit
events on the lifecycle hooks.
"""
import logging
import uuid
from datetime import timedelta
from typing import Optional

from fastapi import Depends, Request
from fastapi_users import FastAPIUsers
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.auth.jwt_backend import build_jwt_auth_backend
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.services.account_lockout import lock_duration_for

from app.core.config import settings
from app.db.session import get_db
from app.models.user.user import User
from app.services.email.password_reset_email import send_password_reset_email
from app.services.email.verification_email import send_verification_email

logger = logging.getLogger(__name__)


def _lock_duration_for(failure_count: int) -> timedelta:
    """Thin wrapper around the shared lock_duration_for, keyed off MJH's
    configured ``lockout_threshold``. Kept module-level so tests can import it.
    """
    return lock_duration_for(failure_count, threshold=settings.lockout_threshold)


async def get_user_db(session: AsyncSession = Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(PlatformBaseUserManager[User]):
    reset_password_token_secret = settings.secret_key
    verification_token_secret = settings.secret_key

    # Properties read settings at call time so tests that monkeypatch
    # ``app.core.auth.settings`` (or the underlying field) still take effect
    # on the next request.
    @property
    def lockout_threshold(self) -> int:
        return settings.lockout_threshold

    @property
    def lockout_autoreset_hours(self) -> int:
        return settings.lockout_autoreset_hours

    @property
    def hibp_enabled(self) -> bool:
        return settings.hibp_enabled

    async def on_after_register(
        self, user: User, request: Optional[Request] = None,
    ) -> None:
        """Trigger the verification email immediately after registration."""
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None,
    ) -> None:
        """Send verification email when a token is generated (registration or resend).

        Raises on any send failure so the registration / resend HTTP request
        fails 5xx and the user retries — never returns a 2xx with the
        verification email lost.
        """
        send_verification_email(user.email, token)
        logger.info("Verification email sent to user_id=%s", user.id)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None,
    ) -> None:
        """Send password-reset email when a token is generated.

        Raises on any send failure so the forgot-password HTTP request
        fails 5xx and the user retries.
        """
        send_password_reset_email(user.email, token)
        logger.info("Password-reset email sent to user_id=%s", user.id)

    async def on_after_verify(
        self, user: User, request: Optional[Request] = None,
    ) -> None:
        logger.info("User verified: user_id=%s", user.id)


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


# Constructed via the shared factory so future apps inherit the wiring.
# Destructure into module-level names so existing
# ``from app.core.auth import bearer_transport / get_jwt_strategy / auth_backend``
# imports keep resolving unchanged.
_jwt = build_jwt_auth_backend(
    secret_key=settings.secret_key,
    lifetime_seconds=settings.jwt_lifetime_seconds,
)
bearer_transport = _jwt.bearer_transport
get_jwt_strategy = _jwt.get_jwt_strategy
auth_backend = _jwt.auth_backend

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
current_active_user = fastapi_users.current_user(active=True, verified=True)
