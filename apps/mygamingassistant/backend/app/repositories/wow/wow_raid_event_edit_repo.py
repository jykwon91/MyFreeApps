"""WowRaidEvent writes for ``raid_event_service`` — posting a raid, Raid: Edit's details, the ping slot.

Split from ``wow_raid_event_repo`` (at the 500-line gate) with its shape:
standalone async functions that assign and flush; the caller owns the
transaction and, for a posted raid, holds its row lock.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent


async def mark_scheduled(db: AsyncSession, event: WowRaidEvent, *, channel_id: str | None) -> WowRaidEvent:
    """Persist [Post raid]: the draft is ``scheduled``, posted into *channel_id* (None keeps its channel)."""
    event.status = "scheduled"
    if channel_id:
        event.channel_id = channel_id
    await db.flush()
    return event


async def mark_draft(db: AsyncSession, event: WowRaidEvent) -> WowRaidEvent:
    """Persist the raid back as a ``draft`` with no post: Discord refused [Post raid]'s message."""
    event.status = "draft"
    event.message_id = None
    await db.flush()
    return event


async def apply_edit(
    db: AsyncSession, event: WowRaidEvent, *, starts_at: datetime | None, size_cap: int | None, notes: str | None
) -> WowRaidEvent:
    """Persist an edit's start, size and notes; None leaves that one as it is."""
    if starts_at is not None:
        event.starts_at = starts_at
    if size_cap is not None:
        event.size_cap = size_cap
    if notes is not None:
        event.notes = notes
    await db.flush()
    return event


async def set_title(db: AsyncSession, event: WowRaidEvent, title: str | None) -> WowRaidEvent:
    """Persist the raid's title; None = the raid's own name."""
    event.title = title
    await db.flush()
    return event


async def set_leader(db: AsyncSession, event: WowRaidEvent, *, user_id: str, display_name: str) -> WowRaidEvent:
    """Persist who leads the raid, and the name the post shows for them."""
    event.leader_user_id = user_id
    event.leader_display_name = display_name
    await db.flush()
    return event


async def set_notes(db: AsyncSession, event: WowRaidEvent, notes: str | None) -> WowRaidEvent:
    """Persist the raid's description; None = none."""
    event.notes = notes
    await db.flush()
    return event


async def set_image_url(db: AsyncSession, event: WowRaidEvent, image_url: str | None) -> WowRaidEvent:
    """Persist the post's banner; None = the raid's own banner."""
    event.image_url = image_url
    await db.flush()
    return event


async def set_color(db: AsyncSession, event: WowRaidEvent, color: int | None) -> WowRaidEvent:
    """Persist the post's color; None = the default."""
    event.color = color
    await db.flush()
    return event


async def set_mention_role_ids(db: AsyncSession, event: WowRaidEvent, role_ids: list[str]) -> WowRaidEvent:
    """Persist the roles the raid pings ([] = nobody)."""
    event.mention_role_ids = role_ids
    await db.flush()
    return event


async def set_cancel_reason(db: AsyncSession, event: WowRaidEvent, reason: str | None) -> WowRaidEvent:
    """Persist the reason the cancelled post shows; None = none."""
    event.cancel_reason = reason
    await db.flush()
    return event


async def set_last_pinged_at(db: AsyncSession, event: WowRaidEvent, at: datetime | None) -> WowRaidEvent:
    """Persist when the raid's last ping went out; None frees the slot again."""
    event.last_pinged_at = at
    await db.flush()
    return event
