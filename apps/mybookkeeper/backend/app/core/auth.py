import logging
import uuid
from typing import Optional, Union

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import BaseUserManager, FastAPIUsers, InvalidPasswordException, UUIDIDMixin, models, schemas
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.system.password_reset_email import send_password_reset_email

logger = logging.getLogger(__name__)
from app.db.session import get_db
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.organization.tax_profile import TaxProfile
from app.models.user.user import User

MIN_PASSWORD_LENGTH = 8


async def get_user_db(session: AsyncSession = Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.secret_key
    verification_token_secret = settings.secret_key

    async def authenticate(
        self, credentials: OAuth2PasswordRequestForm,
    ) -> Optional[models.UP]:
        """Authenticate a user, blocking TOTP-enabled users from the
        standard fastapi-users login endpoint.  TOTP-enabled users must
        go through /auth/totp/login which validates the TOTP code before
        issuing a token."""
        user = await super().authenticate(credentials)
        if user is not None and getattr(user, "totp_enabled", False):
            # Block the standard login endpoint for TOTP users.
            # The /auth/totp/login endpoint calls authenticate_password()
            # directly and handles the TOTP check itself.
            return None
        return user

    async def authenticate_password(
        self, credentials: OAuth2PasswordRequestForm,
    ) -> Optional[models.UP]:
        """Authenticate password only (no TOTP check).
        Used by the unified /auth/totp/login endpoint."""
        return await super().authenticate(credentials)

    async def validate_password(
        self, password: str, user: Union[schemas.UC, models.UP],
    ) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise InvalidPasswordException(
                reason=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
            )

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None,
    ) -> None:
        success = send_password_reset_email(user.email, token)
        if success:
            logger.info("Password reset email sent to %s", user.email)
        else:
            logger.warning("Failed to send password reset email to %s", user.email)

    async def on_after_reset_password(
        self, user: User, request: Optional[Request] = None,
    ) -> None:
        if getattr(user, "totp_enabled", False):
            user.totp_enabled = False
            user.totp_secret = None
            user.totp_recovery_codes = None
            await self.user_db.update(user, {"totp_enabled": False, "totp_secret": None, "totp_recovery_codes": None})
            logger.warning(
                "TOTP disabled for user %s after password reset — re-enrollment required",
                user.id,
            )
        logger.info("Password reset completed for user %s", user.id)

    async def on_after_register(self, user: User, request=None):
        """Auto-create a personal organization for every new user."""
        org = Organization(name=f"{user.email}'s Workspace", created_by=user.id)
        self.user_db.session.add(org)
        await self.user_db.session.flush()
        member = OrganizationMember(
            organization_id=org.id, user_id=user.id, org_role="owner",
        )
        self.user_db.session.add(member)
        await self.user_db.session.flush()
        tax_profile = TaxProfile(organization_id=org.id)
        self.user_db.session.add(tax_profile)
        await self.user_db.session.flush()


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=settings.secret_key, lifetime_seconds=settings.jwt_lifetime_seconds)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
