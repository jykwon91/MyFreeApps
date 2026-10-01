"""Shared lookups for raid interaction handlers.

Every handler resolves the Discord guild to its ``wow_raid_guild`` row and
loads events *scoped to that guild* — a custom_id or autocomplete value from
one server can never reach another server's raid.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo
from app.services.discord.interaction import Interaction


@dataclass(frozen=True)
class RaidContext:
    guild: WowRaidGuild
    event: WowRaidEvent


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_event_id(value: str | None) -> uuid.UUID | None:
    """Parse an autocomplete-supplied event id (users can type anything)."""
    if not value:
        return None
    try:
        return uuid.UUID(value.strip())
    except ValueError:
        return None


async def load_configured_guild(db: AsyncSession, interaction: Interaction) -> WowRaidGuild | None:
    """The guild's config row, or None when /raid-admin setup hasn't run."""
    if interaction.guild_id is None:
        return None
    guild = await wow_raid_guild_repo.get_by_discord_id(db, interaction.guild_id)
    if guild is None or guild.raid_channel_id is None:
        return None
    return guild


async def load_event(
    db: AsyncSession,
    interaction: Interaction,
    event_id: uuid.UUID,
    *,
    lock: bool,
    statuses: tuple[str, ...] = ("scheduled",),
) -> RaidContext | None:
    """Load an event belonging to the interaction's guild, in one of ``statuses``.

    ``lock=True`` takes the row lock that serialises signup mutations.
    """
    guild = await load_configured_guild(db, interaction)
    if guild is None:
        return None
    if lock:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
    else:
        event = await wow_raid_event_repo.get(db, event_id)
    if event is None or event.guild_id != guild.id or event.status not in statuses:
        return None
    return RaidContext(guild=guild, event=event)
