"""Platform admin routes.

Currently only auth-events listing — the security incident review tool.
Other MBK admin endpoints (storage-health, user role management, platform
stats) can land in this file as MJH grows; mirror the MBK shape when
porting.

All routes here are gated by ``require_role(Role.ADMIN, ...)`` —
platform-level admin only. Per-organization admin (when MJH ports the
orgs/members system) gates against ``OrgRole`` not ``Role`` and lives
in a different module.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.permissions import Role, require_role

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.repositories.system import auth_event_repo
from app.schemas.system.auth_event import AuthEventRead


router = APIRouter(prefix="/admin", tags=["admin"])


# Pre-baked admin gate — built once and reused per route. Each app must
# wire its own because the shared `require_role` factory needs the
# app's `current_active_user` dependency (which depends on the app's
# fastapi-users config).
require_admin = require_role(Role.ADMIN, current_active_user=current_active_user)


@router.get("/auth-events", response_model=list[AuthEventRead])
async def list_auth_events(
    user_id: Optional[uuid.UUID] = None,
    event_type: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AuthEventRead]:
    """List auth events with optional filters, newest first.

    Operator-only endpoint for security incident review. All filters AND
    together. ``limit`` capped at 500 to avoid massive responses.

    Mirrors MBK's GET /admin/auth-events shape exactly.
    """
    events = await auth_event_repo.list_filtered(
        db,
        user_id=user_id,
        event_type=event_type,
        since=since,
        limit=limit,
        offset=offset,
    )
    return list(events)
