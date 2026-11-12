"""The guild page's reputation board: factions members have met, and their standing with one.

Read from the database only, like the rest of the guild page.
"""
from __future__ import annotations

from app.db.session import unit_of_work
from app.repositories.wow import guild_repo
from app.schemas.wow.guild.guild_faction_response import GuildFactionResponse
from app.schemas.wow.guild.guild_reputation_response import GuildReputationResponse
from app.schemas.wow.guild.guild_standing_response import GuildStandingResponse


def _chosen_faction(asked: int | None, faction_ids: list[int]) -> int | None:
    """The asked faction if a member has met it, else the first (most members), else None."""
    if asked in faction_ids:
        return asked
    if faction_ids:
        return faction_ids[0]
    return None


async def standings(slug: str, faction_id: int | None) -> GuildReputationResponse | None:
    """None if the guild was never stored. An unknown or missing ``faction_id``
    falls back to the faction most members have met; a gone guild has nobody."""
    async with unit_of_work() as db:
        guild = await guild_repo.get_by_slug(db, slug)
        if guild is None:
            return None
        if guild.gone_at is not None:
            return GuildReputationResponse(faction_id=None, factions=[], standings=[])
        factions = await guild_repo.member_factions(db, guild.id)
        chosen = _chosen_faction(faction_id, [f.id for f in factions])
        rows = [] if chosen is None else await guild_repo.faction_standings(db, guild.id, chosen)
    return GuildReputationResponse(
        faction_id=chosen,
        factions=[GuildFactionResponse(id=f.id, name=f.name, members=f.members) for f in factions],
        standings=[GuildStandingResponse(slug=r.slug, tier=r.tier, value=r.value, max=r.max) for r in rows],
    )
