"""MyRecipes authentication wiring.

Multi-user app — public registration is mounted in main.py. The full
fastapi-users machinery (TOTP, lockout, HIBP, audit) comes from
platform_shared; the boot-seeded platform-admin address is reserved
from registration via ``seed_admin_email`` below.

Mirrors apps/myjobhunter/backend/app/core/auth.py.
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
    return lock_duration_for(failure_count, threshold=settings.lockout_threshold)


async def get_user_db(session: AsyncSession = Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(PlatformBaseUserManager[User]):
    reset_password_token_secret = settings.secret_key
    verification_token_secret = settings.secret_key
    # Reserve the boot-seeded platform-admin address from public
    # registration (rejected exactly like an already-taken email).
    seed_admin_email = settings.seed_admin_email

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
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None,
    ) -> None:
        send_verification_email(user.email, token)
        logger.info("Verification email sent to user_id=%s", user.id)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None,
    ) -> None:
        send_password_reset_email(user.email, token)
        logger.info("Password-reset email sent to user_id=%s", user.id)

    async def on_after_verify(
        self, user: User, request: Optional[Request] = None,
    ) -> None:
        logger.info("User verified: user_id=%s", user.id)


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


_jwt = build_jwt_auth_backend(
    secret_key=settings.secret_key,
    lifetime_seconds=settings.jwt_lifetime_seconds,
)
bearer_transport = _jwt.bearer_transport
get_jwt_strategy = _jwt.get_jwt_strategy
auth_backend = _jwt.auth_backend

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
current_active_user = fastapi_users.current_user(active=True, verified=True)
