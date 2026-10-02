"""WowRaidSeries repository — ORM operations for ``wow_raid_series``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import uuid
from collections.abc import Collection
from datetime import datetime, time
from typing import Final

from sqlalchemy import Interval, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_series import WowRaidSeries

# How far ahead a raid posts is stored in hours: it posts at next_starts_at - hours * this.
_HOUR: Final = literal_column("interval '1 hour'", Interval())
_DAY_HOURS: Final = 24


async def create(
    db: AsyncSession,
    *,
    guild_id: uuid.UUID,
    every_days: int,
    next_starts_at: datetime,
    start_local: time,
    tz_name: str,
    created_by_user_id: str,
) -> WowRaidSeries:
    """Insert a repeat posting each raid when the one before starts, and flush."""
    row = WowRaidSeries(
        guild_id=guild_id,
        every_days=every_days,
        next_starts_at=next_starts_at,
        start_local=start_local,
        tz_name=tz_name,
        created_by_user_id=created_by_user_id,
    )
    db.add(row)
    await db.flush()
    return row


async def get(db: AsyncSession, series_id: uuid.UUID) -> WowRaidSeries | None:
    """Return a repeat by primary key."""
    return await db.get(WowRaidSeries, series_id)


async def set_cadence(
    db: AsyncSession,
    series: WowRaidSeries,
    *,
    every_days: int,
    post_ahead_hours: int | None,
    next_starts_at: datetime,
) -> WowRaidSeries:
    """Change how often the repeat posts, how long before each start, and its next raid."""
    series.every_days = every_days
    series.post_ahead_hours = post_ahead_hours
    series.next_starts_at = next_starts_at
    await db.flush()
    return series


async def set_next(db: AsyncSession, series: WowRaidSeries, starts_at: datetime) -> WowRaidSeries:
    """Move the repeat's next raid to *starts_at*: after a post, a skip or downtime."""
    series.next_starts_at = starts_at
    await db.flush()
    return series


async def set_anchor(
    db: AsyncSession, series: WowRaidSeries, *, starts_at: datetime, start_local: time, tz_name: str
) -> WowRaidSeries:
    """Move the next raid to *starts_at*, and every later one to its time of day (Change next date)."""
    series.next_starts_at = starts_at
    series.start_local = start_local
    series.tz_name = tz_name
    await db.flush()
    return series


async def delete(db: AsyncSession, series: WowRaidSeries) -> None:
    """Delete a repeat; its raids stay, their series_id cleared by the database (ON DELETE SET NULL)."""
    await db.delete(series)
    await db.flush()


async def lock_for_change(db: AsyncSession, series_id: uuid.UUID) -> WowRaidSeries | None:
    """The repeat, row-locked for a leader's change; None when it's gone or held (SKIP LOCKED).

    The worker holds the row while it posts the repeat's next raid, so a
    change then is told to try again rather than wait on Discord.
    ``populate_existing`` refreshes an already-loaded instance.
    """
    result = await db.execute(
        select(WowRaidSeries)
        .where(WowRaidSeries.id == series_id)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def lock_due(
    db: AsyncSession, now: datetime, *, skip: Collection[uuid.UUID] = ()
) -> WowRaidSeries | None:
    """The repeat whose next raid is soonest, of those due to post by *now*; row-locked (SKIP LOCKED).

    A raid posts ``post_ahead_hours`` before its start, or one interval
    before when that's null.  *skip* leaves out the repeats this tick
    already posted: at most one raid per repeat a tick.
    """
    ahead = func.coalesce(WowRaidSeries.post_ahead_hours, WowRaidSeries.every_days * _DAY_HOURS)
    stmt = select(WowRaidSeries).where(WowRaidSeries.next_starts_at - ahead * _HOUR <= now)
    if skip:
        stmt = stmt.where(WowRaidSeries.id.not_in(skip))
    result = await db.execute(
        stmt.order_by(WowRaidSeries.next_starts_at, WowRaidSeries.id)
        .limit(1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def list_for_guild(
    db: AsyncSession, guild_id: uuid.UUID, *, limit: int = 25
) -> list[tuple[WowRaidSeries, WowRaidEvent]]:
    """The server's repeats with their latest raid, soonest next raid first (``/raid-admin repeats``).

    A repeat with no raid left is left out: it ends at its next post time.
    """
    latest = aliased(
        WowRaidEvent,
        select(WowRaidEvent)
        .where(WowRaidEvent.guild_id == guild_id, WowRaidEvent.series_id.is_not(None))
        .distinct(WowRaidEvent.series_id)
        .order_by(WowRaidEvent.series_id, WowRaidEvent.starts_at.desc(), WowRaidEvent.id.desc())
        .subquery(),
    )
    result = await db.execute(
        select(WowRaidSeries, latest)
        .join(latest, latest.series_id == WowRaidSeries.id)
        .where(WowRaidSeries.guild_id == guild_id)
        .order_by(WowRaidSeries.next_starts_at, WowRaidSeries.id)
        .limit(limit)
    )
    return [(series, event) for series, event in result.all()]
