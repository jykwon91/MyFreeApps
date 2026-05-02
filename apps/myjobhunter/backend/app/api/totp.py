"""TOTP enrollment + login challenge endpoints.

Three enrollment endpoints (require an authenticated user):
    POST /auth/totp/setup    — start enrollment, return secret + URI + recovery codes
    POST /auth/totp/verify   — confirm with first 6-digit code, flips totp_enabled=True
    POST /auth/totp/disable  — disable 2FA, requires a current TOTP code (not just a password)

One status probe (auth required, used by the Settings page):
    GET  /auth/totp/status

One login endpoint (anonymous — replaces the standard fastapi-users JWT login
for users with TOTP enabled):
    POST /auth/totp/login

The login endpoint is the source of truth for the post-TOTP-rollout login
flow: it accepts ``{email, password, totp_code?}``. If the user has 2FA
enabled and no code is provided, it returns ``{"detail": "totp_required"}``
with HTTP 200 — the frontend pivots on that exact string to show the TOTP
challenge step. The standard ``/auth/jwt/login`` route still exists and
issues tokens for users without 2FA.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType

from app.core.auth import (
    UserManager,
    current_active_user,
    get_jwt_strategy,
    get_user_manager,
)
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.totp import (
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
    """Begin TOTP enrollment.

    Generates a fresh secret + provisioning URI + 8 recovery codes and stashes
    all three on the user row (encrypted at rest by the column type). Does
    NOT yet flip ``totp_enabled`` — the user must call ``/verify`` with a
    valid code first.

    Recovery codes are returned exactly once. The user is responsible for
    saving them — the backend never re-displays individual codes.
    """
    if user.totp_enabled:
        raise HTTPException(400, "2FA is already enabled")
    secret, uri, recovery = await totp_service.setup_totp(user.id)
    return TotpSetupResponse(
        secret=secret,
        provisioning_uri=uri,
        recovery_codes=recovery,
    )


@router.post("/verify", response_model=TotpVerifyResponse)
async def verify_totp(
    body: TotpVerifyRequest,
    request: Request,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> TotpVerifyResponse:
    """Confirm enrollment by validating the first 6-digit code.

    On success: ``totp_enabled`` is set to True and a TOTP_ENABLED auth event
    is logged. On failure: returns 400 — the user can try again without
    losing their pending secret.
    """
    verified = await totp_service.confirm_totp(user.id, body.code)
    if not verified:
        raise HTTPException(400, "Invalid verification code")
    await log_auth_event(
        db,
        event_type=AuthEventType.TOTP_ENABLED,
        user_id=user.id,
        request=request,
        succeeded=True,
    )
    # The shared ``log_auth_event`` deliberately does not flush — the route
    # handler is the natural commit boundary for audit-only writes that
    # don't share a transaction with any business write.
    await db.commit()
    return TotpVerifyResponse(verified=True)


@router.post("/disable", response_model=TotpDisableResponse)
async def disable_totp(
    body: TotpDisableRequest,
    request: Request,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> TotpDisableResponse:
    """Disable 2FA after verifying a current TOTP code.

    Requires proof of possession of the authenticator device. A leaked
    password alone is insufficient — the attacker would also need a current
    TOTP code, which means they already have everything they need to log in.
    Removing 2FA still has audit value (TOTP_DISABLED event), so the user
    can detect tampering after the fact.
    """
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
    user: User = Depends(current_active_user),
) -> TotpStatusResponse:
    """Cheap probe used by the Settings page to render the right state."""
    return TotpStatusResponse(enabled=user.totp_enabled)


@router.post(
    "/login",
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

    First call (TOTP-enabled user, no code):
        Returns ``{"detail": "totp_required"}`` with HTTP 200. The frontend
        pivots on that exact string to show the TOTP challenge step.

    Second call (TOTP-enabled user, with code) / first call (non-TOTP user):
        Returns ``{"access_token": "...", "token_type": "bearer"}``.
    """
    # Build a credentials object compatible with UserManager.authenticate_password.
    # fastapi-users normally consumes an OAuth2PasswordRequestForm; the duck-typed
    # object below has the same .username/.password attributes the parent reads.
    class _Creds:
        username: str = body.email
        password: str = body.password

    user = await user_manager.authenticate_password(_Creds())  # type: ignore[arg-type]

    if user is None or not user.is_active:
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

    # Email verification gate — mirrors the check fastapi-users applies on the
    # standard /auth/jwt/login route. The TOTP login path must enforce this too
    # or unverified users can obtain a JWT via this endpoint.
    if not user.is_verified:
        raise HTTPException(status_code=400, detail="LOGIN_USER_NOT_VERIFIED")

    # TOTP gate: if the user has 2FA enabled, require the code before issuing JWT.
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
            await db.commit()
            raise HTTPException(status_code=400, detail="invalid_totp")

        event_type = (
            AuthEventType.TOTP_RECOVERY_USED if used_recovery
            else AuthEventType.TOTP_VERIFY_SUCCESS
        )
        await log_auth_event(
            db,
            event_type=event_type,
            user_id=user.id,
            request=request,
            succeeded=True,
        )

    # Issue JWT — same path used by the standard fastapi-users login route.
    strategy = get_jwt_strategy()
    token = await strategy.write_token(user)
    await log_auth_event(
        db,
        event_type=AuthEventType.LOGIN_SUCCESS,
        user_id=user.id,
        request=request,
        succeeded=True,
    )
    await db.commit()
    return TotpLoginResponse(access_token=token, token_type="bearer")
