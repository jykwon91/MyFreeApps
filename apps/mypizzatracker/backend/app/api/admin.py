"""Platform admin routes for MyPizzaTracker.

Auth-events listing for the operator's security audit.
Mirrors apps/myjobhunter/backend/app/api/admin.py.
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
    )
)
