"""User self-service account management endpoints.

DELETE /users/me    — shared platform account deletion (three-factor confirm).
GET    /users/me/export — MGA-specific shape (stub for now; lineups added in Phase 2).

Mounted BEFORE the fastapi-users users router in ``app.main`` so that
``DELETE /users/me`` is matched here rather than fastapi-users'
``DELETE /users/{id}``.

Mirrors apps/myjobhunter/backend/app/api/account.py.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.api.account_deletion_router import (
    build_account_deletion_router,
)

from app.core.auth import current_active_user
from app.db.session import get_db, unit_of_work
from app.models.user.user import User
from app.services.user import account_service
from app.services.user import totp_service

router = APIRouter(tags=["account"])


async def _verify_totp_late_lookup(db, user_id, code):
    """Late-bound TOTP verifier so tests patching the underlying service take effect."""
    return await totp_service.verify_totp_code(db, user_id, code)


router.include_router(
    build_account_deletion_router(
        current_active_user=current_active_user,
        get_db_dependency=get_db,
        verify_totp_step_up=_verify_totp_late_lookup,
        # Lambda for late lookup so tests patching `unit_of_work` take effect.
        unit_of_work_factory=lambda: unit_of_work(),
    )
)


@router.get("/users/me/export")
async def export_user_data(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Export all user data as JSON. Game data (lineups) to be added in Phase 2+."""
    payload = await account_service.build_export(db, user)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": f"attachment; filename=mygamingassistant-export-{timestamp}.json",
        },
    )
