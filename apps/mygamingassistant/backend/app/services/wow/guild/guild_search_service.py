"""Find a stored guild by part of its name, for the guild menu page.

Stored data only, never calls Blizzard: a guild is here once someone looked up
one of its members on "Your character".
"""
from __future__ import annotations

from app.core.wow_guild import GUILD_SEARCH_RESULT_LIMIT
from app.db.session import unit_of_work
from app.repositories.wow import guild_repo
from app.schemas.wow.guild.guild_search_response import GuildSearchResponse
from app.services.wow.guild.guild_summary_mapper import to_guild_summary


async def search(query: str) -> GuildSearchResponse:
    """Live guilds whose name contains ``query``, at most ``GUILD_SEARCH_RESULT_LIMIT``."""
    async with unit_of_work() as db:
        guilds = await guild_repo.search_live(db, query, limit=GUILD_SEARCH_RESULT_LIMIT + 1)
    return GuildSearchResponse(
        query=query,
        guilds=[to_guild_summary(g) for g in guilds[:GUILD_SEARCH_RESULT_LIMIT]],
        truncated=len(guilds) > GUILD_SEARCH_RESULT_LIMIT,
    )
