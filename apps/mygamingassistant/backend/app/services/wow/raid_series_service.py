"""Copies of a raid — the writes, through the repositories.

* :func:`copy_as_draft` — Raid: Edit → Copy raid: a draft with the raid's
  settings for the create preview; the copier makes it.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo


async def copy_as_draft(
    db: AsyncSession,
    *,
    source: WowRaidEvent,
    guild: WowRaidGuild,
    starts_at: datetime,
    user_id: str,
    display_name: str,
) -> WowRaidEvent:
    """A draft of *source* at *starts_at*, for the raid channel; nobody signed up.

    The copier is its creator.  A leader the raid was handed to stays its
    leader; with none, the copier leads, as on any new raid.
    """
    assert guild.raid_channel_id is not None, "guild must be configured before creating raids"
    return await wow_raid_event_repo.create_copy(
        db,
        source,
        starts_at=starts_at,
        status="draft",
        channel_id=guild.raid_channel_id,
        created_by_user_id=user_id,
        created_by_display_name=display_name,
    )
