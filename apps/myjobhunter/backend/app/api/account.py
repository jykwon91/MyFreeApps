"""User self-service account management endpoints.

DELETE /users/me        — hard-delete account (requires password + email confirmation + TOTP if enabled)
GET    /users/me/export — download full data export as JSON

Mounted BEFORE the fastapi-users users router in ``app.main`` so the
``DELETE /users/me`` matcher fires here rather than the fastapi-users
``DELETE /users/{id}`` matcher.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi_users.password import PasswordHelper
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db, unit_of_work
from app.models.user.user import User
from app.schemas.user.account import DeleteAccountRequest
from app.services.user import account_service
from app.services.user.totp_service import verify_totp_code

router = APIRouter(tags=["account"])

logger = logging.getLogger(__name__)


@router.delete("/users/me", status_code=204)
async def delete_my_account(
    body: DeleteAccountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(current_active_user),
) -> None:
    """Permanently delete the authenticated user's account and all their data.

    Requires:
    - Correct account password
    - Email address matching the account (typed confirmation)
    - TOTP code if 2FA is enabled
    """
    # Re-verify password to prevent CSRF and accidental deletion.
    helper = PasswordHelper()
    verified, _ = helper.verify_and_update(body.password, current_user.hashed_password)
    if not verified:
        raise HTTPException(status_code=403, detail="Incorrect password")

    # Email confirmation must exactly match the account email (case-insensitive).
    if body.confirm_email.strip().lower() != current_user.email.lower():
        raise HTTPException(status_code=400, detail="Email confirmation does not match")

    # TOTP gate: if the user has 2FA enabled, require a valid code.
    if current_user.totp_enabled:
        if not body.totp_code:
            raise HTTPException(status_code=400, detail="TOTP_CODE_REQUIRED")
        if not await verify_totp_code(db, current_user.id, body.totp_code):
            raise HTTPException(status_code=403, detail="Invalid TOTP code")

    async with unit_of_work() as txn_db:
        await account_service.delete_account(txn_db, current_user)


@router.get("/users/me/export")
async def export_my_data(
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Export the authenticated user's full data as JSON.

    Excludes all secrets (hashed_password, TOTP secret/recovery codes,
    job-board encrypted credentials).
    """
    payload = await account_service.build_export(db, current_user)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": f"attachment; filename=myjobhunter-export-{timestamp}.json",
        },
    )
