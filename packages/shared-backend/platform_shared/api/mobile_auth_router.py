"""Shared ``/auth/mobile`` routes: sign-in that lasts, per device.

    POST   /auth/mobile/login          email + password + optional 2FA code
    POST   /auth/mobile/refresh        swap a refresh token for new tokens
    POST   /auth/mobile/logout         end the session a refresh token belongs to
    GET    /auth/mobile/sessions       the user's signed-in devices
    DELETE /auth/mobile/sessions/{id}  sign out one of them

The access token lasts 30 minutes in every app, whatever the app's web lifetime is,
because a phone can quietly get a new one. A refresh never moves ``auth_time``: only a
login proves who the user is.
"""
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.params import Depends as DependsParam
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.auth.jwt_backend import IatJWTStrategy
from platform_shared.auth.refreshed_session import RefreshedSession
from platform_shared.auth.released_current_user import released_current_user
from platform_shared.auth.totp_route_service import TotpRouteService
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.auth.verified_login import verify_login
from platform_shared.core.rate_limit import RateLimiter
from platform_shared.core.refresh_session_limits import (
    MOBILE_ACCESS_TOKEN_SECONDS,
    REFRESH_ATTEMPTS_PER_IP,
    REFRESH_ATTEMPTS_PER_SESSION,
    REFRESH_IP_WINDOW_SECONDS,
    REFRESH_SESSION_WINDOW_SECONDS,
)
from platform_shared.core.request_utils import get_client_ip
from platform_shared.schemas.mobile_auth.device_session_read import DeviceSessionRead
from platform_shared.schemas.mobile_auth.mobile_login_request import MobileLoginRequest
from platform_shared.schemas.mobile_auth.mobile_login_response import MobileLoginResponse
from platform_shared.schemas.mobile_auth.refresh_request import RefreshRequest
from platform_shared.services.refresh_session_service import RefreshSessionService

REFRESH_INVALID_DETAIL = "refresh_invalid"


def build_mobile_auth_router(
    *,
    secret_key: str,
    session_service: RefreshSessionService,
    current_active_user: Callable[..., Awaitable[Any]],
    get_user_manager: Callable[..., AsyncIterator[PlatformBaseUserManager]],
    get_db: Callable[..., AsyncIterator[AsyncSession]],
    totp_service: TotpRouteService,
    login_dependencies: Sequence[DependsParam],
) -> APIRouter:
    """Build the ``/auth/mobile`` router.

    Args:
        secret_key: The app's secret key. Signs access tokens, which must pass the
            app's normal bearer check.
        session_service: The app's refresh sessions.
        current_active_user: The app's fastapi-users ``current_active_user``.
        get_user_manager: The app's user manager dependency.
        get_db: The app's ``get_db`` dependency.
        totp_service: The app's TOTP service module.
        login_dependencies: The app's rate limit and lockout checks for login.
    """
    router = APIRouter(prefix="/auth/mobile", tags=["auth"])
    released_user = released_current_user(current_active_user, get_db)
    access_strategy = IatJWTStrategy(secret=secret_key, lifetime_seconds=MOBILE_ACCESS_TOKEN_SECONDS)
    ip_limiter = RateLimiter(REFRESH_ATTEMPTS_PER_IP, REFRESH_IP_WINDOW_SECONDS)
    session_limiter = RateLimiter(REFRESH_ATTEMPTS_PER_SESSION, REFRESH_SESSION_WINDOW_SECONDS)

    async def tokens_for(refreshed: RefreshedSession) -> MobileLoginResponse:
        access_token = await access_strategy.write_session_token(
            refreshed.user, auth_time=refreshed.session.auth_time,
        )
        return MobileLoginResponse(
            access_token=access_token,
            refresh_token=refreshed.refresh_token,
            token_type="bearer",
            expires_in=MOBILE_ACCESS_TOKEN_SECONDS,
            session_id=refreshed.session.id,
        )

    @router.post("/login", dependencies=list(login_dependencies), response_model_exclude_none=True)
    async def mobile_login(
        request: Request,
        response: Response,
        body: MobileLoginRequest,
        user_manager: PlatformBaseUserManager = Depends(get_user_manager),
    ) -> MobileLoginResponse:
        """A TOTP-enabled user with no code gets ``{"detail": "totp_required"}`` with HTTP 200."""
        response.headers["Cache-Control"] = "no-store"
        user = await verify_login(
            email=body.email,
            password=body.password,
            totp_code=body.totp_code,
            request=request,
            user_manager=user_manager,
            totp_service=totp_service,
        )
        if user is None:
            return MobileLoginResponse(detail="totp_required")
        return await tokens_for(await session_service.issue(user, device_name=body.device_name))

    @router.post("/refresh", response_model_exclude_none=True)
    async def mobile_refresh(
        request: Request,
        response: Response,
        body: RefreshRequest,
    ) -> MobileLoginResponse:
        """A 429 changes nothing, so the client keeps its token and tries again later.

        Only a 401 ``refresh_invalid`` means the client should sign out.
        """
        response.headers["Cache-Control"] = "no-store"
        ip_limiter.check(get_client_ip(request))
        session_id = session_service.session_id_of(body.refresh_token)
        if session_id is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=REFRESH_INVALID_DETAIL)
        session_limiter.check(str(session_id))

        refreshed = await session_service.rotate(body.refresh_token, request=request)
        if refreshed is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=REFRESH_INVALID_DETAIL)
        return await tokens_for(refreshed)

    @router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
    async def mobile_logout(body: RefreshRequest) -> None:
        """Takes the refresh token, because the access token may have expired by now."""
        await session_service.end(body.refresh_token)

    @router.get("/sessions")
    async def list_sessions(
        user: Any = Depends(current_active_user),
        db: AsyncSession = Depends(get_db),
    ) -> list[DeviceSessionRead]:
        sessions = await session_service.list_active(db, user)
        return [DeviceSessionRead.model_validate(session) for session in sessions]

    @router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def revoke_session(
        session_id: uuid.UUID,
        request: Request,
        user: Any = Depends(released_user),
    ) -> None:
        """The same 404 for another user's session as for one that doesn't exist.

        The device can't refresh after this. Its current access token keeps working
        until it expires, at most 30 minutes.
        """
        if not await session_service.revoke(user.id, session_id, request=request):
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Session not found")

    return router


__all__ = ["REFRESH_INVALID_DETAIL", "build_mobile_auth_router"]
