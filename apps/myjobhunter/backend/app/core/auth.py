import logging
import uuid

from fastapi import Depends
from fastapi_users import BaseUserManager, FastAPIUsers, InvalidPasswordException, UUIDIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.services.hibp_service import HIBPCheckError, is_password_pwned

from app.core.config import settings
from app.db.session import get_db
from app.models.user.user import User

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 12


async def get_user_db(session: AsyncSession = Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.secret_key
    verification_token_secret = settings.secret_key

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
                # Fail-open: a HIBP outage must not block registrations or password resets.
                # The tradeoff is a narrow window where a breached password slips through;
                # the alternative (fail-closed) means any HIBP downtime = no signups.
                logger.warning("HIBP check failed; accepting password without breach check", exc_info=True)


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
