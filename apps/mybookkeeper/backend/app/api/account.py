"""User self-service account management endpoints.

DELETE /users/me        — extracted to ``platform_shared.api.account_deletion_router``
                          (audit C1+H9, 2026-05-09). This module wires the shared
                          factory with MBK's auth/db/totp dependencies.
GET    /users/me/export — MBK-specific (per-org context); stays inline.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.api.account_deletion_router import (
    build_account_deletion_router,
)

from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import get_db, unit_of_work
from app.models.user.user import User
from app.services.user import account_service
from app.services.user import totp_service

router = APIRouter(tags=["account"])

# Shared three-factor account-deletion endpoint (DELETE /users/me).
# Mirrors MJH's wiring; both apps now call the service-layer
# verify_totp_code(db, user_id, code) for the TOTP gate (post-#547 H5).
async def _verify_totp_late_lookup(db, user_id, code):
    """Late-bound TOTP verifier so tests patching the underlying service take effect.

    The shared `build_account_deletion_router` captures the verifier callable
    at build time. Pass this thin wrapper that does an attribute lookup on
    the ``totp_service`` module each call, so tests doing
    ``patch("app.services.user.totp_service.verify_totp_code", ...)`` see
    their stub on the next request.
    """
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
async def export_my_data(
    current_user: User = Depends(current_active_user),
    ctx: RequestContext = Depends(current_org_member),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Export the authenticated user's full data as JSON.

    Excludes all secrets (hashed_password, TOTP secret/recovery codes, OAuth tokens).
    """
    payload = await account_service.build_export(db, current_user, ctx.organization_id)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": f"attachment; filename=mybookkeeper-export-{timestamp}.json",
        },
    )
