import logging
import uuid
from typing import Optional

from fastapi import Depends, Request
from fastapi_users import (
    BaseUserManager,
    FastAPIUsers,
    InvalidPasswordException,
    UUIDIDMixin,
)
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user.user import User
from app.services.email.verification_email import send_verification_email

logger = logging.getLogger(__name__)


async def get_user_db(session: AsyncSession = Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.secret_key
    verification_token_secret = settings.secret_key

    async def validate_password(self, password: str, user: User | None = None) -> None:
        if len(password) < 12:
            raise InvalidPasswordException(reason="Password must be at least 12 characters.")

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
            logger.info("Verification email sent to %s", user.email)
        else:
            logger.warning("Failed to send verification email to %s", user.email)

    async def on_after_verify(
        self, user: User, request: Optional[Request] = None,
    ) -> None:
        logger.info("User verified: %s", user.email)


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
