"""The password and 2FA checks behind every login that doesn't use the OAuth2 form.

``log_auth_event`` doesn't flush, and apps' ``get_db`` never commits, so this commits
its own audit rows before refusing. A successful login leaves its rows for the caller
to commit along with whatever it issues.
"""
from types import SimpleNamespace
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.auth.totp_route_service import TotpRouteService
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.auth_event_service import log_auth_event


async def verify_login(
    *,
    email: str,
    password: str,
    totp_code: str | None,
    request: Request,
    user_manager: PlatformBaseUserManager,
    totp_service: TotpRouteService,
    db: AsyncSession,
) -> Any | None:
    """The user, or None if they have 2FA and sent no code. Raises on a refused login."""
    # authenticate_password reads .username and .password, like the OAuth2 form.
    credentials = SimpleNamespace(username=email, password=password)
    user = await user_manager.authenticate_password(credentials, request)

    if user is None:
        await log_auth_event(
            db,
            event_type=AuthEventType.LOGIN_FAILURE,
            user_id=None,
            request=request,
            succeeded=False,
            metadata={"reason": "bad_credentials"},
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="LOGIN_BAD_CREDENTIALS")

    if not user.is_active:
        await log_auth_event(
            db,
            event_type=AuthEventType.LOGIN_FAILURE,
            user_id=user.id,
            request=request,
            succeeded=False,
            metadata={"reason": "account_inactive"},
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="LOGIN_BAD_CREDENTIALS")

    # Mirrors the check on /auth/jwt/login, or unverified users could get a token here.
    if not user.is_verified:
        await log_auth_event(
            db,
            event_type=AuthEventType.LOGIN_BLOCKED_UNVERIFIED,
            user_id=user.id,
            request=request,
            succeeded=False,
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="LOGIN_USER_NOT_VERIFIED")

    if user.totp_enabled:
        if not totp_code:
            return None
        valid, used_recovery = await totp_service.validate_totp_for_login(user.email, totp_code)
        if not valid:
            await user_manager.count_failed_second_factor(user)
            await log_auth_event(
                db,
                event_type=AuthEventType.TOTP_VERIFY_FAILURE,
                user_id=user.id,
                request=request,
                succeeded=False,
            )
            await db.commit()
            raise HTTPException(status_code=401, detail="invalid_totp")

        await user_manager.clear_failed_logins(user)
        await log_auth_event(
            db,
            event_type=(
                AuthEventType.TOTP_RECOVERY_USED if used_recovery
                else AuthEventType.TOTP_VERIFY_SUCCESS
            ),
            user_id=user.id,
            request=request,
            succeeded=True,
        )

    await log_auth_event(
        db,
        event_type=AuthEventType.LOGIN_SUCCESS,
        user_id=user.id,
        request=request,
        succeeded=True,
    )
    return user


__all__ = ["verify_login"]
