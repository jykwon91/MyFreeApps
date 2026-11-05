"""The password and 2FA checks behind every login that doesn't use the OAuth2 form.

Every audit row is saved in its own transaction before this refuses or returns, and
the request's session holds no connection while the 2FA service takes one.
"""
from types import SimpleNamespace
from typing import Any

from fastapi import HTTPException, Request

from platform_shared.auth.totp_route_service import TotpRouteService
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.guard_outcome import GuardOutcome


async def verify_login(
    *,
    email: str,
    password: str,
    totp_code: str | None,
    request: Request,
    user_manager: PlatformBaseUserManager,
    totp_service: TotpRouteService,
) -> Any | None:
    """The user, or None if they have 2FA and sent no code. Raises on a refused login."""
    guard = user_manager.account_guard
    # authenticate_password reads .username and .password, like the OAuth2 form.
    credentials = SimpleNamespace(username=email, password=password)
    user = await user_manager.authenticate_password(credentials, request)

    if user is None:
        await guard.record_event(
            AuthEventType.LOGIN_FAILURE,
            user_id=None,
            request=request,
            succeeded=False,
            metadata={"reason": "bad_credentials"},
        )
        raise HTTPException(status_code=400, detail="LOGIN_BAD_CREDENTIALS")

    if not user.is_active:
        await guard.record_event(
            AuthEventType.LOGIN_FAILURE,
            user_id=user.id,
            request=request,
            succeeded=False,
            metadata={"reason": "account_inactive"},
        )
        raise HTTPException(status_code=400, detail="LOGIN_BAD_CREDENTIALS")

    # Mirrors the check on /auth/jwt/login, or unverified users could get a token here.
    if not user.is_verified:
        await guard.record_event(
            AuthEventType.LOGIN_BLOCKED_UNVERIFIED,
            user_id=user.id,
            request=request,
            succeeded=False,
        )
        raise HTTPException(status_code=400, detail="LOGIN_USER_NOT_VERIFIED")

    if not user.totp_enabled:
        await guard.record_event(AuthEventType.LOGIN_SUCCESS, user_id=user.id, request=request, succeeded=True)
        return user

    if not totp_code:
        return None
    valid, used_recovery = await totp_service.validate_totp_for_login(user.email, totp_code)
    # Codes sent together all got past the lock check in the password step.
    outcome = await guard.record_code_attempt(
        user.id,
        valid=valid,
        success_events=(
            AuthEventType.TOTP_RECOVERY_USED if used_recovery else AuthEventType.TOTP_VERIFY_SUCCESS,
            AuthEventType.LOGIN_SUCCESS,
        ),
        request=request,
    )
    if outcome is GuardOutcome.LOCKED:
        raise HTTPException(status_code=400, detail="LOGIN_BAD_CREDENTIALS")
    if outcome is GuardOutcome.WRONG:
        raise HTTPException(status_code=401, detail="invalid_totp")
    return user


__all__ = ["verify_login"]
