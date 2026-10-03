"""The raid's web page: the reads behind ``GET /wow/raids/{web_id}``.

Every read is keyed by the event the ``web_id`` resolved to; the caller
never names a guild or a user.  A draft has no page (None, like an unknown
id).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo, wow_raid_signup_repo
from app.schemas.wow.raid_web import RaidPage
from app.services.discord.rest import message_link
from app.services.wow.raid_web_view import build_page


async def get_page(db: AsyncSession, web_id: uuid.UUID, now: datetime) -> RaidPage | None:
    """The page of the posted raid *web_id* names; None when there's none, or it's a draft."""
    event = await wow_raid_event_repo.get_by_web_id(db, web_id)
    if event is None or event.status == "draft":
        return None
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    guild = await wow_raid_guild_repo.get(db, event.guild_id)
    return build_page(event, signups, discord_url=discord_url(event, guild), now=now)


def discord_url(event: WowRaidEvent, guild: WowRaidGuild | None) -> str | None:
    """The raid's post in Discord, for [Open in Discord]; None once there's no post to open."""
    if guild is None or event.message_id is None or event.post_deleted_at is not None:
        return None
    return message_link(guild.discord_guild_id, event.channel_id, event.message_id)
