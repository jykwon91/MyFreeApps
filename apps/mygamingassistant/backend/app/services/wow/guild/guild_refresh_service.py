"""On-demand guild refresh ("Refresh now" on the guild page).

``claim`` decides, with one atomic UPDATE, whether this request may refresh the
guild: not if its roster was asked for within ``GUILD_REFRESH_COOLDOWN`` (by the
scheduler, a failed try, or another click). The refresh itself
(``guild_roster_service.refresh_now``) runs after the response, so the click
returns at once and the page watches the guild for the result.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from app.core.wow_guild import GUILD_REFRESH_COOLDOWN, GUILD_REFRESHABLE_SLUG
from app.db.session import unit_of_work
from app.repositories.wow import guild_repo
from app.services.wow.guild import guild_roster_service
from app.services.wow.guild.guild_refresh_claim import GuildRefreshClaim


async def claim(slug: str, *, now: datetime | None = None) -> GuildRefreshClaim | None:
    """Claim a refresh of the live guild with this slug; None unless it is the refreshable guild and stored."""
    if slug != GUILD_REFRESHABLE_SLUG:
        return None
    at = now or datetime.now(timezone.utc)
    async with unit_of_work() as db:
        guild = await guild_repo.get_by_slug(db, slug)
        if guild is None or guild.gone_at is not None:
            return None
        if await guild_repo.claim_refresh(db, guild.id, at=at, claimable_before=at - GUILD_REFRESH_COOLDOWN):
            return GuildRefreshClaim(
                guild=guild, at=at, started=True, retry_after_seconds=int(GUILD_REFRESH_COOLDOWN.total_seconds()),
            )
        # Lost: read the stamp that won (a click a moment ago, the scheduler, a failed try).
        await db.refresh(guild)
    checked_at = guild.roster_checked_at or at
    remaining = (checked_at + GUILD_REFRESH_COOLDOWN - at).total_seconds()
    return GuildRefreshClaim(guild=guild, at=at, started=False, retry_after_seconds=max(math.ceil(remaining), 1))


async def run(claim: GuildRefreshClaim) -> None:
    """Run the refresh a started claim won."""
    await guild_roster_service.refresh_now(claim.guild, now=claim.at)
