"""WowRaidGuild repository — ORM operations for ``wow_raid_guild``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_guild import WowRaidGuild


async def get(db: AsyncSession, guild_id: uuid.UUID) -> WowRaidGuild | None:
    """Return a guild config row by primary key."""
    return await db.get(WowRaidGuild, guild_id)


async def get_by_discord_id(
    db: AsyncSession, discord_guild_id: str
) -> WowRaidGuild | None:
    """Return the guild config row for *discord_guild_id*, or None."""
    result = await db.execute(
        select(WowRaidGuild).where(
            WowRaidGuild.discord_guild_id == discord_guild_id
        )
    )
    return result.scalar_one_or_none()


async def set_ping_role(db: AsyncSession, guild: WowRaidGuild, role_id: str | None) -> WowRaidGuild:
    """Set the role a new raid's post pings; None = ping nobody."""
    guild.ping_role_id = role_id
    await db.flush()
    return guild


async def upsert_config(
    db: AsyncSession,
    *,
    discord_guild_id: str,
    raid_channel_id: str | None = None,
    ping_role_id: str | None = None,
    timezone: str | None = None,
    settings: dict[str, Any] | None = None,
    configured_by_user_id: str | None = None,
    default_discord_event: bool | None = None,
    default_thread: bool | None = None,
) -> WowRaidGuild:
    """Insert a new guild config or update the mutable fields of an existing one.

    Only the fields explicitly passed are updated on an existing row — callers
    can omit fields they don't want to change by leaving them at their
    defaults (None).  A new row with no ``timezone`` gets "UTC", and the
    extras' defaults (``default_discord_event``, ``default_thread``) off.  An
    existing ``settings`` value is replaced in full if a new
    dict is provided; otherwise it is left unchanged.
    """
    existing = await get_by_discord_id(db, discord_guild_id)
    if existing is not None:
        changed = False
        if raid_channel_id is not None and existing.raid_channel_id != raid_channel_id:
            existing.raid_channel_id = raid_channel_id
            changed = True
        if ping_role_id is not None and existing.ping_role_id != ping_role_id:
            existing.ping_role_id = ping_role_id
            changed = True
        if timezone is not None and existing.timezone != timezone:
            existing.timezone = timezone
            changed = True
        if settings is not None and existing.settings != settings:
            existing.settings = settings
            changed = True
        if (
            configured_by_user_id is not None
            and existing.configured_by_user_id != configured_by_user_id
        ):
            existing.configured_by_user_id = configured_by_user_id
            changed = True
        if default_discord_event is not None and existing.default_discord_event != default_discord_event:
            existing.default_discord_event = default_discord_event
            changed = True
        if default_thread is not None and existing.default_thread != default_thread:
            existing.default_thread = default_thread
            changed = True
        if changed:
            await db.flush()
        return existing

    row = WowRaidGuild(
        discord_guild_id=discord_guild_id,
        raid_channel_id=raid_channel_id,
        ping_role_id=ping_role_id,
        timezone=timezone or "UTC",
        configured_by_user_id=configured_by_user_id,
        default_discord_event=bool(default_discord_event),
        default_thread=bool(default_thread),
    )
    if settings is not None:
        row.settings = settings
    db.add(row)
    await db.flush()
    return row
