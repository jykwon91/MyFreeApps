from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType

from app.core.auth import (
    UserManager,
    current_active_user,
    get_jwt_strategy,
    get_user_manager,
)
from app.core.rate_limit import (
    check_login_rate_limit,
    check_totp_account_not_locked,
    check_totp_rate_limit,
)
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.user.totp import (
    TotpDisableRequest,
    TotpDisableResponse,
    TotpLoginRequest,
    TotpLoginResponse,
    TotpSetupResponse,
    TotpStatusResponse,
    TotpVerifyRequest,
    TotpVerifyResponse,
)
from app.services.system.auth_event_service import log_auth_event
from app.services.user import totp_service

router = APIRouter(prefix="/auth/totp", tags=["auth"])


@router.post("/setup", response_model=TotpSetupResponse)
async def setup_totp(
    user: User = Depends(current_active_user),
) -> TotpSetupResponse:
    if user.totp_enabled:
        raise HTTPException(400, "2FA is already enabled")
    secret, uri = await totp_service.setup_totp(user.id)
    return TotpSetupResponse(secret=secret, provisioning_uri=uri)


@router.post("/verify", response_model=TotpVerifyResponse)
async def verify_totp(
    body: TotpVerifyRequest,
    request: Request,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> TotpVerifyResponse:
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
    return TotpVerifyResponse(verified=True, recovery_codes=recovery_codes)


@router.post("/disable")
async def disable_totp(
    body: TotpDisableRequest,
    request: Request,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> TotpDisableResponse:
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
    return TotpDisableResponse(disabled=True)


@router.get("/status")
async def totp_status(user: User = Depends(current_active_user)) -> TotpStatusResponse:
    return TotpStatusResponse(enabled=user.totp_enabled)


@router.post(
    "/login",
    dependencies=[
        Depends(check_login_rate_limit),
        Depends(check_totp_rate_limit),
        Depends(check_totp_account_not_locked),
    ],
    response_model=TotpLoginResponse,
    response_model_exclude_none=True,
)
async def totp_login(
    request: Request,
    body: TotpLoginRequest,
    user_manager: UserManager = Depends(get_user_manager),
    db: AsyncSession = Depends(get_db),
) -> TotpLoginResponse:
    """Unified login endpoint: email + password + optional totp_code.

    If the user has TOTP enabled and no code is provided, returns
    {"detail": "totp_required"} with status 200 so the frontend can
    show the TOTP input. If the code is provided and valid, returns
    {"access_token": "...", "token_type": "bearer"}.
    """
    # Build a credentials object compatible with UserManager.authenticate_password
    class _Creds:
        username: str = body.email
        password: str = body.password

    user = await user_manager.authenticate_password(_Creds(), request)  # type: ignore[arg-type]

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

    # TOTP gate: if user has 2FA enabled, require the code
    if user.totp_enabled:
        if not body.totp_code:
            return TotpLoginResponse(detail="totp_required")

        valid, used_recovery = await totp_service.validate_totp_for_login(
            user.email, body.totp_code,
        )
        if not valid:
            await log_auth_event(
                db,
                event_type=AuthEventType.TOTP_VERIFY_FAILURE,
                user_id=user.id,
                request=request,
                succeeded=False,
            )
            raise HTTPException(status_code=401, detail="Invalid authentication code")

        event_type = AuthEventType.TOTP_RECOVERY_USED if used_recovery else AuthEventType.TOTP_VERIFY_SUCCESS
        await log_auth_event(
            db,
            event_type=event_type,
            user_id=user.id,
            request=request,
            succeeded=True,
        )

    # Issue JWT token
    strategy = get_jwt_strategy()
    token = await strategy.write_token(user)
    await log_auth_event(
        db,
        event_type=AuthEventType.LOGIN_SUCCESS,
        user_id=user.id,
        request=request,
        succeeded=True,
    )
    return TotpLoginResponse(access_token=token, token_type="bearer")
