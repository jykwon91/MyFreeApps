"""Shared ``/auth/totp`` routes: enrollment, status and login.

Three enrollment endpoints (require an authenticated user):
    POST /auth/totp/setup    — start enrollment, return secret + URI
    POST /auth/totp/verify   — confirm with first 6-digit code, flips totp_enabled=True
    POST /auth/totp/disable  — disable 2FA, requires a current TOTP code (not just a password)

One status probe (auth required, used by the Settings page):
    GET  /auth/totp/status

One login endpoint (anonymous — replaces the standard fastapi-users JWT login
for users with TOTP enabled):
    POST /auth/totp/login

The login endpoint accepts ``{email, password, totp_code?}``. If the user has
2FA enabled and no code is provided, it returns ``{"detail": "totp_required"}``
with HTTP 200 — the frontend pivots on that exact string to show the TOTP
challenge step. The standard ``/auth/jwt/login`` route still exists and issues
tokens for users without 2FA.

``log_auth_event`` doesn't flush, and apps' ``get_db`` never commits, so each
route commits its own audit rows.
"""
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.params import Depends as DependsParam
from fastapi_users.authentication import Strategy
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.auth.totp_route_service import TotpRouteService
from platform_shared.auth.totp_route_user import TotpRouteUser
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.auth.verified_login import verify_login
from platform_shared.core.auth_events import AuthEventType
from platform_shared.schemas.totp.totp_disable_request import TotpDisableRequest
from platform_shared.schemas.totp.totp_disable_response import TotpDisableResponse
from platform_shared.schemas.totp.totp_login_request import TotpLoginRequest
from platform_shared.schemas.totp.totp_login_response import TotpLoginResponse
from platform_shared.schemas.totp.totp_setup_response import TotpSetupResponse
from platform_shared.schemas.totp.totp_status_response import TotpStatusResponse
from platform_shared.schemas.totp.totp_verify_request import TotpVerifyRequest
from platform_shared.schemas.totp.totp_verify_response import TotpVerifyResponse
from platform_shared.services.auth_event_service import log_auth_event


def build_totp_router(
    *,
    current_active_user: Callable[..., Awaitable[TotpRouteUser]],
    get_user_manager: Callable[..., AsyncIterator[PlatformBaseUserManager]],
    get_db: Callable[..., AsyncIterator[AsyncSession]],
    get_jwt_strategy: Callable[[], Strategy],
    totp_service: TotpRouteService,
    login_dependencies: Sequence[DependsParam],
) -> APIRouter:
    """Build the ``/auth/totp`` router.

    Args:
        current_active_user: The app's fastapi-users ``current_active_user``.
        get_user_manager: The app's user manager dependency.
        get_db: The app's ``get_db`` dependency.
        get_jwt_strategy: The app's strategy factory. Issues the login token.
        totp_service: The app's TOTP service module. Its functions are looked
            up on each request.
        login_dependencies: The app's rate limit and lockout checks for login.
    """
    router = APIRouter(prefix="/auth/totp", tags=["auth"])

    @router.post("/setup", response_model=TotpSetupResponse)
    async def setup_totp(
        user: TotpRouteUser = Depends(current_active_user),
    ) -> TotpSetupResponse:
        """Begin enrollment.

        Doesn't flip ``totp_enabled`` or issue recovery codes. Those wait for
        ``/verify``, so the user never walks away with codes for an enrollment
        that doesn't work.
        """
        if user.totp_enabled:
            raise HTTPException(400, "2FA is already enabled")
        secret, uri = await totp_service.setup_totp(user.id)
        return TotpSetupResponse(secret=secret, provisioning_uri=uri)

    @router.post("/verify", response_model=TotpVerifyResponse)
    async def verify_totp(
        body: TotpVerifyRequest,
        request: Request,
        user: TotpRouteUser = Depends(current_active_user),
        db: AsyncSession = Depends(get_db),
    ) -> TotpVerifyResponse:
        """Confirm enrollment. Recovery codes are returned here, exactly once."""
        verified, recovery_codes = await totp_service.confirm_totp(user.id, body.code)
        if not verified:
            raise HTTPException(400, "Invalid verification code")
        await log_auth_event(
            db,
            event_type=AuthEventType.TOTP_ENABLED,
            user_id=user.id,
            request=request,
            succeeded=True,
        )
        await db.commit()
        return TotpVerifyResponse(verified=True, recovery_codes=recovery_codes)

    @router.post("/disable", response_model=TotpDisableResponse)
    async def disable_totp(
        body: TotpDisableRequest,
        request: Request,
        user: TotpRouteUser = Depends(current_active_user),
        db: AsyncSession = Depends(get_db),
    ) -> TotpDisableResponse:
        """Disable 2FA after verifying a current code."""
        disabled = await totp_service.disable_totp(user.id, body.code)
        if not disabled:
            raise HTTPException(400, "Invalid code or 2FA is not enabled")
        await log_auth_event(
            db,
            event_type=AuthEventType.TOTP_DISABLED,
            user_id=user.id,
            request=request,
            succeeded=True,
        )
        await db.commit()
        return TotpDisableResponse(disabled=True)

    @router.get("/status", response_model=TotpStatusResponse)
    async def totp_status(
        user: TotpRouteUser = Depends(current_active_user),
    ) -> TotpStatusResponse:
        return TotpStatusResponse(enabled=user.totp_enabled)

    @router.post(
        "/login",
        dependencies=list(login_dependencies),
        response_model=TotpLoginResponse,
        response_model_exclude_none=True,
    )
    async def totp_login(
        request: Request,
        body: TotpLoginRequest,
        user_manager: PlatformBaseUserManager = Depends(get_user_manager),
        db: AsyncSession = Depends(get_db),
    ) -> TotpLoginResponse:
        """Email + password + optional code.

        A TOTP-enabled user with no code gets ``{"detail": "totp_required"}``
        with HTTP 200. Otherwise the response carries the access token.
        """
        user = await verify_login(
            email=body.email,
            password=body.password,
            totp_code=body.totp_code,
            request=request,
            user_manager=user_manager,
            totp_service=totp_service,
            db=db,
        )
        if user is None:
            return TotpLoginResponse(detail="totp_required")
        token = await get_jwt_strategy().write_token(user)
        await db.commit()
        return TotpLoginResponse(access_token=token, token_type="bearer")

    return router


__all__ = ["build_totp_router"]
