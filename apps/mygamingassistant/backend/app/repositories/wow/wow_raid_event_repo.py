"""WowRaidEvent repository — ORM operations for ``wow_raid_event``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select, update
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
    status: str = "scheduled",
    created_by_display_name: str | None = None,
) -> WowRaidEvent:
    """Insert a new raid event and flush.

    ``status="draft"`` is used by /raid-admin create: the row backs the
    organiser's private preview until they press [Post raid].
    """
    row = WowRaidEvent(
        guild_id=guild_id,
        raid_key=raid_key,
        title=title,
        starts_at=starts_at,
        size_cap=size_cap,
        status=status,
        channel_id=channel_id,
        created_by_user_id=created_by_user_id,
        created_by_display_name=created_by_display_name,
        notes=notes,
    )
    db.add(row)
    await db.flush()
    return row


async def get(db: AsyncSession, event_id: uuid.UUID) -> WowRaidEvent | None:
    """Return a single event by primary key."""
    return await db.get(WowRaidEvent, event_id)


async def get_for_update(
    db: AsyncSession, event_id: uuid.UUID
) -> WowRaidEvent | None:
    """Return the event with a row lock (SELECT … FOR UPDATE).

    Every signup mutation locks its event first so concurrent clicks on the
    same raid serialise — two players can't both take the last seat.
    ``populate_existing`` refreshes an already-loaded instance.
    """
    result = await db.execute(
        select(WowRaidEvent)
        .where(WowRaidEvent.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def delete(db: AsyncSession, event: WowRaidEvent) -> None:
    """Hard-delete an event (used only for discarded drafts)."""
    await db.delete(event)
    await db.flush()


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


async def list_scheduled_starting_after(
    db: AsyncSession, *, after: datetime
) -> list[WowRaidEvent]:
    """Every guild's ``scheduled`` events starting after *after*, soonest first.

    Ties go by id, so concurrent workers visit the events in the same order.
    """
    result = await db.execute(
        select(WowRaidEvent)
        .where(
            WowRaidEvent.status == "scheduled",
            WowRaidEvent.starts_at > after,
        )
        .order_by(WowRaidEvent.starts_at, WowRaidEvent.id)
    )
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


async def complete_started_events(db: AsyncSession, *, started_before: datetime) -> int:
    """Flip every ``scheduled`` event that started before *started_before* to ``completed``.

    Run by the notification worker each tick so finished raids drop out of
    ``scheduled`` (listings, autocomplete, the worker's own sends).  Returns
    the number of events completed.
    """
    result = await db.execute(
        update(WowRaidEvent)
        .where(
            WowRaidEvent.status == "scheduled",
            WowRaidEvent.starts_at < started_before,
        )
        .values(status="completed", updated_at=func.now())
    )
    await db.flush()
    return result.rowcount or 0
