import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import BaseUserManager, FastAPIUsers, InvalidPasswordException, UUIDIDMixin, exceptions, models, schemas
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
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
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.organization.tax_profile import TaxProfile
from app.models.user.user import User
from app.services.system.auth_event_service import log_auth_event
from app.services.system.password_reset_email import send_password_reset_email
from app.services.system.verification_email import send_verification_email

logger = logging.getLogger(__name__)

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


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.secret_key
    verification_token_secret = settings.secret_key

    async def authenticate(
        self, credentials: OAuth2PasswordRequestForm,
    ) -> Optional[models.UP]:
        """Authenticate a user with account-level lockout enforcement.

        Layers on top of the standard fastapi-users authenticate():
        1. Check if account is locked — reject without checking password.
        2. Auto-reset stale failure counter (no activity in >24 h).
        3. Delegate to parent for password verification.
        4. On failure: increment counter, apply exponential lock at threshold.
        5. On success: clear counter and lock.

        Also blocks TOTP-enabled users — they must use /auth/totp/login.
        """
        db = self.user_db.session

        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            # Unknown email — mimic parent's timing mitigation and return None.
            self.password_helper.hash(credentials.password)
            # Log without a user_id; store only the domain to avoid full-email PII.
            email_domain = credentials.username.split("@", 1)[-1] if "@" in credentials.username else ""
            await log_auth_event(
                db,
                event_type=AuthEventType.LOGIN_FAILURE,
                user_id=None,
                succeeded=False,
                metadata={"email_domain": email_domain, "reason": "unknown_email"},
            )
            return None

        now = datetime.now(tz=timezone.utc)

        # Reject immediately if a lock is still in effect.
        if account_is_locked(user, now=now):
            logger.info(
                "Login rejected for locked account user_id=%s (locked until %s)",
                user.id,
                user.locked_until,
            )
            await emit_locked_login_event(db=db, user_id=user.id)
            return None

        # Auto-reset a stale counter — occasional typos should not compound forever.
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

        # Delegate to parent for password verification.
        result = await super().authenticate(credentials)

        if result is None:
            # Bad password — increment failure counter and apply exponential
            # lock at threshold via the shared policy module.
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
                    "Account locked: user_id=%s until %s (consecutive failures: %d)",
                    user.id,
                    update["locked_until"],
                    update["failed_login_count"],
                )
            await self.user_db.update(user, update)
            return None

        # Successful password match — clear lockout state if any.
        clear_update = record_successful_login_update(result)
        if clear_update is not None:
            await self.user_db.update(result, clear_update)

        # Block unverified users — they must click the verification link first.
        # The TOTP login endpoint surfaces LOGIN_USER_NOT_VERIFIED to the frontend.
        # The standard JWT endpoint gets generic 400 (bad credentials) which is acceptable.
        if not result.is_verified:
            await log_auth_event(
                db,
                event_type=AuthEventType.LOGIN_BLOCKED_UNVERIFIED,
                user_id=result.id,
                succeeded=False,
            )
            return None

        # Block TOTP-enabled users from the standard login endpoint.
        # They must use /auth/totp/login which validates the TOTP code first.
        if getattr(result, "totp_enabled", False):
            return None

        await log_auth_event(
            db,
            event_type=AuthEventType.LOGIN_SUCCESS,
            user_id=result.id,
            succeeded=True,
        )
        return result

    async def authenticate_password(
        self,
        credentials: OAuth2PasswordRequestForm,
        request: Optional[Request] = None,
    ) -> Optional[models.UP]:
        """Authenticate password only (no TOTP check), with full lockout tracking.

        Used by the unified /auth/totp/login endpoint.  Replicates the
        lockout-counter logic from :meth:`authenticate` so that bad-password
        attempts via this path increment ``failed_login_count`` and ultimately
        lock the account — closing the bypass that existed when this method
        called ``super().authenticate()`` directly.

        The route-level ``check_totp_account_not_locked`` dependency handles the
        early-reject case; this method handles the counter update on failure and
        the counter clear on success.

        Pass ``request`` so that ``emit_locked_login_event`` can capture
        ``ip_address`` and ``user_agent`` in the audit row.
        """
        db = self.user_db.session

        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            self.password_helper.hash(credentials.password)
            return None

        now = datetime.now(tz=timezone.utc)

        # Auto-reset stale counter before the password check.
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

        # Delegate to parent for password verification only (no TOTP gate).
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
                    "Account locked: user_id=%s until %s (consecutive failures: %d)",
                    user.id,
                    update["locked_until"],
                    update["failed_login_count"],
                )
            await self.user_db.update(user, update)
            return None

        # Successful password match — clear lockout state if any.
        clear_update = record_successful_login_update(result)
        if clear_update is not None:
            await self.user_db.update(result, clear_update)

        return result

    async def validate_password(
        self, password: str, user: Union[schemas.UC, models.UP],
    ) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise InvalidPasswordException(
                reason=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
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

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None,
    ) -> None:
        success = send_password_reset_email(user.email, token)
        if success:
            logger.info("Password reset email sent to %s", user.email)
        else:
            logger.warning("Failed to send password reset email to %s", user.email)
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

    async def on_after_register(self, user: User, request=None):
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
        """Send verification email when a token is generated (registration or resend)."""
        success = send_verification_email(user.email, token)
        if success:
            logger.info("Verification email sent to %s", user.email)
        else:
            logger.warning("Failed to send verification email to %s", user.email)
        await log_auth_event(
            self.user_db.session,
            event_type=AuthEventType.EMAIL_VERIFY_RESEND,
            user_id=user.id,
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
