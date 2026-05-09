"""Read repository for the auth_events audit table.

Writes go through ``platform_shared.services.auth_event_service.log_auth_event``;
reads go through here. Used by the admin auth-events listing route
(``platform_shared.api.admin_auth_events_router``).
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.db.models.auth_event import AuthEvent


async def list_filtered(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[AuthEvent]:
    """List auth events with optional filters, newest first.

    All filters AND together. ``limit`` should be capped by the route
    (the shared admin router caps at 500).
    """
    filters: list = []
    if user_id is not None:
        filters.append(AuthEvent.user_id == user_id)
    if event_type is not None:
        filters.append(AuthEvent.event_type == event_type)
    if since is not None:
        filters.append(AuthEvent.created_at >= since)

    query = (
        select(AuthEvent)
        .order_by(AuthEvent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if filters:
        query = query.where(and_(*filters))

    result = await db.execute(query)
    return result.scalars().all()
