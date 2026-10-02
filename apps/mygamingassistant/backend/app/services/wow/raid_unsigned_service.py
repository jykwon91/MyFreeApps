"""Raid: Unsigned's writes — the raid's and the server's raider roles, and its ping slot.

The caller owns the transaction (one per Discord interaction); every write
goes through the repositories.  The rules are ``raid_unsigned``'s.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo, wow_raid_signup_repo
from app.services.wow.raid_unsigned import Pool, ping_ready


async def claim_ping(db: AsyncSession, event: WowRaidEvent, *, now: datetime) -> bool:
    """Record an Unsigned ping going out now; False while the last one is too recent.

    Expects the event row lock, so two leaders submitting at once send one ping.
    """
    if not ping_ready(event, now):
        return False
    await wow_raid_event_repo.set_unsigned_pinged_at(db, event, now)
    return True


async def release_ping(db: AsyncSession, event: WowRaidEvent, *, claimed_at: datetime) -> None:
    """Hand back a ping that never went out, unless a later one claimed the slot since."""
    if event.unsigned_pinged_at == claimed_at:
        await wow_raid_event_repo.set_unsigned_pinged_at(db, event, None)


async def set_raid_roles(db: AsyncSession, event: WowRaidEvent, picked: Sequence[str], *, inherited: Pool) -> bool:
    """Save the roles picked for the raid; True when it now has roles of its own.

    Nothing picked, or the very roles it would check anyway (*inherited*),
    stores none, so the raid follows the default when that changes.
    """
    role_ids: list[str] | None = list(picked)
    if not picked or set(picked) == set(inherited.role_ids):
        role_ids = None
    await wow_raid_event_repo.set_raider_role_ids(db, event, role_ids)
    return role_ids is not None


async def set_server_roles(db: AsyncSession, guild: WowRaidGuild, picked: Sequence[str]) -> None:
    """Save the server's raider roles; nothing picked clears them."""
    await wow_raid_guild_repo.set_raider_role_ids(db, guild, list(picked) or None)


async def classes_for(db: AsyncSession, guild: WowRaidGuild, user_ids: Sequence[str]) -> dict[str, str]:
    """Each member's class on their latest sign-up with one in the server's raids."""
    return await wow_raid_signup_repo.last_classes(db, guild_id=guild.id, user_ids=user_ids)
