"""WowRaidAttendance repository — ORM operations for ``wow_raid_attendance``.

Standalone async functions; the caller owns the transaction.  Every read is
by raid: callers start from raids already scoped to a guild (the window, or a
leader's loaded raid), never from a player alone.
"""
from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_attendance import WowRaidAttendance

_ONE_ROW_PER_PLAYER = ["event_id", "discord_user_id"]


async def add_many(db: AsyncSession, event_id: uuid.UUID, rows: Sequence[Mapping[str, object]]) -> int:
    """Insert a raid's rows; a player already on it is skipped (ON CONFLICT DO NOTHING).

    Returns how many went in.
    """
    if not rows:
        return 0
    result = await db.execute(
        pg_insert(WowRaidAttendance)
        .values([{**row, "event_id": event_id} for row in rows])
        .on_conflict_do_nothing(index_elements=_ONE_ROW_PER_PLAYER)
    )
    await db.flush()
    return result.rowcount or 0


async def add(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    discord_user_id: str,
    display_name: str,
    outcome: str,
    marked_by_user_id: str,
    marked_at: datetime,
) -> bool:
    """Add a player a leader picked (no sign-up); False when they're already on it.

    The row is created as it's marked (``created_at`` = ``marked_at``), so a
    later change shows as ``marked_at`` moving on.
    """
    result = await db.execute(
        pg_insert(WowRaidAttendance)
        .values(
            event_id=event_id,
            discord_user_id=discord_user_id,
            display_name=display_name,
            outcome=outcome,
            marked_by_user_id=marked_by_user_id,
            marked_at=marked_at,
            created_at=marked_at,
        )
        .on_conflict_do_nothing(index_elements=_ONE_ROW_PER_PLAYER)
    )
    await db.flush()
    return bool(result.rowcount)


async def get(db: AsyncSession, *, event_id: uuid.UUID, discord_user_id: str) -> WowRaidAttendance | None:
    """One player's row on a raid, or None."""
    result = await db.execute(
        select(WowRaidAttendance).where(
            WowRaidAttendance.event_id == event_id,
            WowRaidAttendance.discord_user_id == discord_user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_for_event(db: AsyncSession, event_id: uuid.UUID) -> list[WowRaidAttendance]:
    """A raid's rows (by user id; callers order them for display)."""
    result = await db.execute(
        select(WowRaidAttendance)
        .where(WowRaidAttendance.event_id == event_id)
        .order_by(WowRaidAttendance.discord_user_id)
    )
    return list(result.scalars().all())


async def list_for_events(
    db: AsyncSession, event_ids: Sequence[uuid.UUID], *, member: str | None = None
) -> list[WowRaidAttendance]:
    """Several raids' rows in one query; *member* narrows them to one player's."""
    if not event_ids:
        return []
    stmt = select(WowRaidAttendance).where(WowRaidAttendance.event_id.in_(event_ids))
    if member is not None:
        stmt = stmt.where(WowRaidAttendance.discord_user_id == member)
    result = await db.execute(stmt.order_by(WowRaidAttendance.event_id, WowRaidAttendance.discord_user_id))
    return list(result.scalars().all())


async def set_outcome(
    db: AsyncSession, mark: WowRaidAttendance, outcome: str, *, by: str, at: datetime
) -> WowRaidAttendance:
    """A leader marking how the player's raid went; who and when are kept."""
    mark.outcome = outcome
    mark.marked_by_user_id = by
    mark.marked_at = at
    await db.flush()
    return mark


async def delete(db: AsyncSession, mark: WowRaidAttendance) -> None:
    """Take a player a leader added off the raid's attendance."""
    await db.delete(mark)
    await db.flush()
