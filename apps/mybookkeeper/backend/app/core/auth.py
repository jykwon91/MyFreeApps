import logging
import uuid
from datetime import timedelta
from typing import Any, Optional

from fastapi import Depends, Request
from fastapi_users import FastAPIUsers
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.auth.jwt_backend import build_jwt_auth_backend
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.account_lockout import lock_duration_for
from platform_shared.services.auth_event_service import log_auth_event

from app.core.config import settings
from app.db.session import get_db
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.organization.tax_profile import TaxProfile
from app.models.user.user import User
from app.services.system.password_reset_email import send_password_reset_email
from app.services.system.verification_email import send_verification_email

logger = logging.getLogger(__name__)

# Module-level back-compat alias — test_password_validation.py and other
# call sites import this. The value lives in
# :class:`PlatformBaseUserManager.min_password_length`.
MIN_PASSWORD_LENGTH = 12


def _lock_duration_for(failure_count: int) -> timedelta:
    """Return exponential lock duration based on consecutive failure count.

    Thin back-compat wrapper around the shared
    :func:`platform_shared.services.account_lockout.lock_duration_for`.
    Existing test imports of ``app.core.auth._lock_duration_for`` keep
    working; the underlying schedule is the shared default.
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

    async def on_after_register(self, user: User, request=None) -> None:
        """Auto-create a personal organization for every new user, then send verification email."""
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
        await log_auth_event(
            self.user_db.session,
            event_type=AuthEventType.REGISTER_SUCCESS,
            user_id=user.id,
            succeeded=True,
        )
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request=None,
    ) -> None:
        """Send verification email when a token is generated (registration or resend).

        Raises on any send failure so the registration / resend HTTP request
        fails 5xx and the user retries — never returns a 2xx with the
        verification email lost. The pre-2026-05-09 bool-returning version
        silently swallowed failures, which produced the
        kennethmontgo@gmail.com bug class (registered-but-unverified
        account with no recovery path).
        """
        send_verification_email(user.email, token)
        logger.info("Verification email sent to %s", user.email)
        await log_auth_event(
            self.user_db.session,
            event_type=AuthEventType.EMAIL_VERIFY_RESEND,
            user_id=user.id,
            succeeded=True,
        )

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None,
    ) -> None:
        """Send password-reset email when a token is generated.

        Raises on any send failure so the forgot-password HTTP request
        fails 5xx and the user retries — never returns 2xx with the reset
        email lost.
        """
        send_password_reset_email(user.email, token)
        logger.info("Password reset email sent to %s", user.email)
        await log_auth_event(
            self.user_db.session,
            event_type=AuthEventType.PASSWORD_RESET_REQUEST,
            user_id=user.id,
            request=request,
            succeeded=True,
        )

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
        await log_auth_event(
            self.user_db.session,
            event_type=AuthEventType.PASSWORD_RESET_SUCCESS,
            user_id=user.id,
            request=request,
            succeeded=True,
        )

    async def on_after_update(
        self, user: User, update_dict: dict[str, Any], request: Optional[Request] = None,
    ) -> None:
        """Log password changes (profile updates that include hashed_password)."""
        if "hashed_password" in update_dict:
            await log_auth_event(
                self.user_db.session,
                event_type=AuthEventType.PASSWORD_CHANGE_SUCCESS,
                user_id=user.id,
                request=request,
                succeeded=True,
            )

    async def on_after_verify(
        self, user: User, request=None,
    ) -> None:
        """Called after a user successfully verifies their email."""
        logger.info("User verified: %s", user.email)
        await log_auth_event(
            self.user_db.session,
            event_type=AuthEventType.EMAIL_VERIFY_SUCCESS,
            user_id=user.id,
            succeeded=True,
        )


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
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
