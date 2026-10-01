"""WowRaidEvent repository — ORM operations for ``wow_raid_event``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent


async def create(
    db: AsyncSession,
    *,
    guild_id: uuid.UUID,
    raid_key: str,
    starts_at: datetime,
    size_cap: int,
    channel_id: str,
    created_by_user_id: str,
    title: str | None = None,
    notes: str | None = None,
) -> WowRaidEvent:
    """Insert a new raid event and flush."""
    row = WowRaidEvent(
        guild_id=guild_id,
        raid_key=raid_key,
        title=title,
        starts_at=starts_at,
        size_cap=size_cap,
        status="scheduled",
        channel_id=channel_id,
        created_by_user_id=created_by_user_id,
        notes=notes,
    )
    db.add(row)
    await db.flush()
    return row


async def get(db: AsyncSession, event_id: uuid.UUID) -> WowRaidEvent | None:
    """Return a single event by primary key."""
    return await db.get(WowRaidEvent, event_id)


async def list_upcoming(
    db: AsyncSession,
    guild_id: uuid.UUID,
    *,
    after: datetime | None = None,
    limit: int = 20,
) -> list[WowRaidEvent]:
    """Return scheduled events for *guild_id* ordered by ``starts_at`` ASC.

    If *after* is given, only events starting after that timestamp are
    returned (useful for cursor-based pagination).
    """
    stmt = (
        select(WowRaidEvent)
        .where(
            WowRaidEvent.guild_id == guild_id,
            WowRaidEvent.status == "scheduled",
        )
        .order_by(WowRaidEvent.starts_at)
        .limit(limit)
    )
    if after is not None:
        stmt = stmt.where(WowRaidEvent.starts_at > after)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def set_message_id(
    db: AsyncSession, event: WowRaidEvent, message_id: str
) -> WowRaidEvent:
    """Persist the Discord message ID of the signup embed."""
    event.message_id = message_id
    await db.flush()
    return event


async def cancel(db: AsyncSession, event: WowRaidEvent) -> WowRaidEvent:
    """Transition event to 'cancelled'."""
    event.status = "cancelled"
    await db.flush()
    return event


async def mark_completed(
    db: AsyncSession, event: WowRaidEvent
) -> WowRaidEvent:
    """Transition event to 'completed'."""
    event.status = "completed"
    await db.flush()
    return event
