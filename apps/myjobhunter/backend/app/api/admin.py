"""Platform admin routes.

Currently only auth-events listing — the security incident review tool.
Other MBK admin endpoints (storage-health, platform stats) can land in
this file as MJH grows; mirror the MBK shape when porting.

All routes here are gated by ``current_superuser`` — operator only.
MJH does not have a multi-tier admin role; the platform is single-
operator with everyone else as a regular user.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import current_superuser
from app.db.session import get_db
from app.models.user.user import User
from app.repositories.system import auth_event_repo
from app.schemas.system.auth_event import AuthEventRead


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/auth-events", response_model=list[AuthEventRead])
async def list_auth_events(
    user_id: Optional[uuid.UUID] = None,
    event_type: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin: User = Depends(current_superuser),
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
