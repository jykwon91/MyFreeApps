"""Raid: Edit → Advanced and /raid-admin advanced — the settings' writes, and the raids that follow the server.

Each setter assigns and flushes; the caller owns the transaction (and, for a
raid, holds its row lock).  A role list of None is SQL NULL: the raid follows
the server, the server falls back to the built-in default.  ``[]`` is a
raid's own "everyone" (allowed) or "nobody" (banned).  The server's ready
check lives in ``wow_raid_guild.settings`` (``wow_raid_guild_repo.upsert_config``).

The post options (0042): a raid's pin and voice channel follow the server
while NULL (``'0'`` = no voice channel on this raid), its delete delay is its
own.  ``pinned_message_id`` is the post the bot pinned.  The delete sweep
takes a finished raid with :func:`lock_post_delete_due` and stamps it with
:func:`mark_post_deleted`.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Final, Literal

from sqlalchemy import Interval, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild

# Which role list: who may join (``signup``), or who may not (``banned``).
RoleList = Literal["signup", "banned"]
# The raid columns a server change reaches, on the raids that leave them NULL.
_FOLLOWING: Final[dict[str, Any]] = {
    "signup_role_ids": WowRaidEvent.signup_role_ids,
    "pin_post": WowRaidEvent.pin_post,
    "voice_channel_id": WowRaidEvent.voice_channel_id,
}
_MINUTE: Final = literal_column("interval '1 minute'", Interval())


async def set_min_signups(db: AsyncSession, event: WowRaidEvent, value: int | None) -> None:
    """The raid's minimum sign-ups; None = no minimum."""
    event.min_signups = value
    await db.flush()


async def set_event_roles(
    db: AsyncSession, event: WowRaidEvent, *, which: RoleList, role_ids: Sequence[str] | None
) -> None:
    """The raid's own allowed or banned list; None = follow the server."""
    stored = _stored(role_ids)
    if which == "signup":
        event.signup_role_ids = stored
    else:
        event.banned_role_ids = stored
    await db.flush()


async def set_guild_roles(
    db: AsyncSession, guild: WowRaidGuild, *, which: RoleList, role_ids: Sequence[str] | None
) -> None:
    """The server's allowed or banned list; None = everyone may join / nobody is kept out."""
    stored = _stored(role_ids)
    if which == "signup":
        guild.signup_role_ids = stored
    else:
        guild.banned_role_ids = stored
    await db.flush()


async def set_ready_check(db: AsyncSession, event: WowRaidEvent, minutes: int | None) -> None:
    """The raid's ready check, in minutes before the start (0 = none); None = follow the server."""
    event.ready_check_minutes = minutes
    await db.flush()


async def list_open_following(
    db: AsyncSession, guild_id: uuid.UUID, column: str, *, limit: int = 25
) -> list[uuid.UUID]:
    """The guild's posted raids still to start that leave *column* to the server (NULL), soonest first."""
    result = await db.execute(
        select(WowRaidEvent.id)
        .where(
            WowRaidEvent.guild_id == guild_id,
            WowRaidEvent.status == "scheduled",
            WowRaidEvent.message_id.is_not(None),
            WowRaidEvent.start_applied_at.is_(None),
            _FOLLOWING[column].is_(None),
        )
        .order_by(WowRaidEvent.starts_at)
        .limit(limit)
    )
    return list(result.scalars())


async def set_pin_post(db: AsyncSession, event: WowRaidEvent, value: bool | None) -> None:
    """Pin the raid's post, or not; None = follow the server."""
    event.pin_post = value
    await db.flush()


async def set_guild_pin_posts(db: AsyncSession, guild: WowRaidGuild, value: bool) -> None:
    """Pin the posts of the raids that don't set their own."""
    guild.pin_posts = value
    await db.flush()


async def set_pinned_message(db: AsyncSession, event: WowRaidEvent, message_id: str | None) -> None:
    """The post the bot pinned; None once it's unpinned, or the post is gone."""
    event.pinned_message_id = message_id
    await db.flush()


async def set_voice_channel(db: AsyncSession, event: WowRaidEvent, channel_id: str | None) -> None:
    """The voice channel the raid's post links: ``'0'`` = none on this raid; None = follow the server."""
    event.voice_channel_id = channel_id
    await db.flush()


async def set_guild_voice_channel(db: AsyncSession, guild: WowRaidGuild, channel_id: str | None) -> None:
    """The voice channel the posts of raids that don't set their own link; None = none."""
    guild.voice_channel_id = channel_id
    await db.flush()


async def set_delete_after(db: AsyncSession, event: WowRaidEvent, hours: int | None) -> None:
    """Delete the raid's post this many hours after the raid ends; None = keep it."""
    event.delete_post_after_hours = hours
    await db.flush()


async def lock_post_delete_due(db: AsyncSession, now: datetime, *, default_length: int) -> WowRaidEvent | None:
    """The earliest finished raid whose post is due to go (ties by id), FOR UPDATE SKIP LOCKED.

    Completed or cancelled, still posted, a delay set and the post not
    deleted yet, and *now* at least that delay past the raid's end — its start
    plus its length (*default_length* minutes when it has none).  The
    notification worker's delete sweep (``raid_sweeps``) takes them one at a time.
    """
    length = func.coalesce(WowRaidEvent.length_minutes, default_length)
    due = WowRaidEvent.starts_at + (length + WowRaidEvent.delete_post_after_hours * 60) * _MINUTE
    result = await db.execute(
        select(WowRaidEvent)
        .where(
            WowRaidEvent.status.in_(("completed", "cancelled")),
            WowRaidEvent.message_id.is_not(None),
            WowRaidEvent.delete_post_after_hours.is_not(None),
            WowRaidEvent.post_deleted_at.is_(None),
            WowRaidEvent.starts_at <= now,
            due <= now,
        )
        .order_by(WowRaidEvent.starts_at, WowRaidEvent.id)
        .limit(1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def mark_post_deleted(db: AsyncSession, event: WowRaidEvent, now: datetime) -> None:
    """The bot is deleting the raid's post: forget it and its pin, once (``post_deleted_at``).  The raid stays."""
    event.message_id = None
    event.pinned_message_id = None
    event.post_deleted_at = now
    await db.flush()


def _stored(role_ids: Sequence[str] | None) -> list[str] | None:
    if role_ids is None:
        return None
    return list(role_ids)
