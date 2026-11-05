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
  * ``seed_admin_email`` — defaults to "" (no reservation). Multi-user
    apps that seed a platform admin at boot set this to
    ``settings.seed_admin_email`` so the address can never be claimed
    through public registration (see
    ``platform_shared.services.seed_admin_service``).

Subclasses MUST override:

  * ``on_after_register`` — for app-specific seed data + verification dispatch
  * ``on_after_request_verify`` — to actually deliver the verification email
  * ``on_after_forgot_password`` — to deliver the reset email

Subclasses MAY override:

  * ``on_after_reset_password`` — e.g. to disable TOTP after password reset
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
from typing import Any, Generic, Optional, TypeVar, Union

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

from platform_shared.auth.session_invalidation import session_cutoff_now
from platform_shared.core.auth_events import AuthEventType
from platform_shared.db.session import release_connection, unit_of_work_on_same_database
from platform_shared.services.account_guard_service import AccountGuardService
from platform_shared.services.guard_outcome import GuardOutcome
from platform_shared.services.hibp_service import HIBPCheckError, is_password_pwned
from platform_shared.services.seed_admin_service import is_reserved_seed_email

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
    seed_admin_email: str = ""

    async def create(
        self,
        user_create: schemas.UC,
        safe: bool = False,
        request: Optional[Request] = None,
    ) -> models.UP:
        """Reserve the seeded platform-admin address from registration.

        With open registration, whoever registers ``SEED_ADMIN_EMAIL``
        first would otherwise own the row the boot-time seed matches by
        email. The seed itself refuses to promote a non-seed-owned row
        (hash check), but reserving the address here closes the squat
        window entirely. Raises the same ``UserAlreadyExists`` the parent
        raises for a taken email — indistinguishable, no enumeration
        signal.
        """
        if is_reserved_seed_email(
            getattr(user_create, "email", ""), self.seed_admin_email,
        ):
            raise exceptions.UserAlreadyExists()
        return await super().create(user_create, safe=safe, request=request)

    @property
    def account_guard(self) -> AccountGuardService:
        """Lockout and audit writes, in transactions separate from the request's session."""
        session = self.user_db.session
        return AccountGuardService(
            user_model=self.user_db.user_table,
            unit_of_work_factory=lambda: unit_of_work_on_same_database(session),
            lockout_threshold=self.lockout_threshold,
            lockout_autoreset_hours=self.lockout_autoreset_hours,
        )

    async def authenticate(
        self, credentials: OAuth2PasswordRequestForm,
    ) -> Optional[models.UP]:
        """Authenticate a user with account-level lockout enforcement.

        Layers on top of the standard fastapi-users authenticate():
        1. Look up the user by email; unknown email → log LOGIN_FAILURE
           with PII-safe metadata (domain only) and return None.
        2. Apply the lockout flow in :meth:`_check_password`.
        3. Block unverified users (LOGIN_BLOCKED_UNVERIFIED).
        4. Block TOTP-enabled users — they must use /auth/totp/login.
        5. Log LOGIN_SUCCESS for the standard JWT path only.
        """
        guard = self.account_guard
        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            # Unknown email — mimic parent's timing mitigation.
            await self._refuse_unknown_email(credentials, request=None)
            return None

        result = await self._check_password(user, credentials, request=None)
        if result is None:
            return None

        # Block unverified users from the standard JWT login.
        # Defense-in-depth alongside `current_active_user(verified=True)`.
        if not result.is_verified:
            await guard.record_event(AuthEventType.LOGIN_BLOCKED_UNVERIFIED, user_id=result.id, succeeded=False)
            return None

        # Block TOTP-enabled users — they must use /auth/totp/login,
        # which calls authenticate_password() to bypass this gate.
        if getattr(result, "totp_enabled", False):
            return None

        await guard.record_event(AuthEventType.LOGIN_SUCCESS, user_id=result.id, succeeded=True)
        return result

    async def authenticate_password(
        self,
        credentials: OAuth2PasswordRequestForm,
        request: Optional[Request] = None,
    ) -> Optional[models.UP]:
        """Password-only authenticate (no TOTP gate, no verified gate).

        Used by the unified ``/auth/totp/login`` endpoint, which performs
        TOTP validation + verified-user check itself after this returns.
        Runs the same lockout flow as the standard login, so the 2FA login path
        enjoys the same brute-force protection. Returns with the request's
        connection released, ready for the 2FA service to take its own.

        Every refusal has already been recorded when this returns ``None``. Pass
        ``request`` so that row captures ``ip_address`` and ``user_agent``.

        Calling this from anywhere else bypasses 2FA — don't.
        """
        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            await self._refuse_unknown_email(credentials, request=request)
            return None
        return await self._check_password(user, credentials, request=request)

    async def _refuse_unknown_email(
        self,
        credentials: OAuth2PasswordRequestForm,
        *,
        request: Optional[Request],
    ) -> None:
        """Hash anyway so timing can't reveal the email is unknown, and record it by domain only."""
        self.password_helper.hash(credentials.password)
        await release_connection(self.user_db.session)
        email_domain = (
            credentials.username.split("@", 1)[-1]
            if "@" in credentials.username
            else ""
        )
        await self.account_guard.record_event(
            AuthEventType.LOGIN_FAILURE,
            user_id=None,
            request=request,
            succeeded=False,
            metadata={"email_domain": email_domain, "reason": "unknown_email"},
        )

    async def _check_password(
        self,
        user: models.UP,
        credentials: OAuth2PasswordRequestForm,
        *,
        request: Optional[Request],
    ) -> Optional[models.UP]:
        """Lock check → stale reset → password check → count or clear."""
        session = self.user_db.session
        guard = self.account_guard
        await release_connection(session)
        if await guard.begin_attempt(user.id, request=request) is GuardOutcome.LOCKED:
            logger.info("Login rejected for locked account user_id=%s", user.id)
            return None

        result = await super().authenticate(credentials)
        await release_connection(session)

        outcome = await guard.record_password_attempt(
            user.id,
            correct=result is not None,
            finishes_login=True,
            request=request,
        )
        return result if outcome is GuardOutcome.ALLOWED else None

    async def _update(self, user: UP, update_dict: dict[str, Any]) -> UP:
        """End every existing session when the password changes.

        Here rather than in ``on_after_reset_password``, which subclasses override
        without calling ``super()``. Password reset passes through this method.

        The cutoff is taken after validating and hashing, which can take seconds.
        Taken before, a login with the old password during that wait would issue
        a token newer than the cutoff, which would survive the change.
        """
        password = update_dict.get("password")
        if password is None:
            return await super()._update(user, update_dict)
        await self.validate_password(password, user)
        hashed_password = self.password_helper.hash(password)
        others = {field: value for field, value in update_dict.items() if field != "password"}
        return await super()._update(
            user,
            {**others, "hashed_password": hashed_password, "auth_valid_after": session_cutoff_now()},
        )

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
