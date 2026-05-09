"""Platform admin routes.

Currently only auth-events listing — the security incident review tool.
The route lives in ``platform_shared.api.admin_auth_events_router``;
this module wires it up with MJH's admin guard + db dependency.

Other MBK admin endpoints (storage-health, platform stats, clean-re-extract)
have not been ported to MJH yet — when they are, mirror the MBK shape.

All routes here are gated by ``current_superuser`` — operator only.
MJH does not have a multi-tier admin role; the platform is single-
operator with everyone else as a regular user.
"""
from __future__ import annotations

from fastapi import APIRouter

from platform_shared.api.admin_auth_events_router import (
    build_admin_auth_events_router,
)

from app.core.permissions import current_superuser
from app.db.session import get_db


router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(
    build_admin_auth_events_router(
        admin_dependency=current_superuser,
        get_db_dependency=get_db,
    ),
)
