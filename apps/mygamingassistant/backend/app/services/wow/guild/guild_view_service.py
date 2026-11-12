"""The guild page: a stored guild and its members, read from the database only.

A guild is stored when someone looks up one of its members on "Your
character"; the roster refresh (``guild_roster_service``) then fills in the
rest. Nothing here calls Blizzard.
"""
from __future__ import annotations

from app.db.session import unit_of_work
from app.repositories.wow import guild_repo
from app.schemas.wow.guild.guild_response import GuildResponse
from app.services.wow.guild.guild_response_mapper import to_guild_response


async def get_guild(slug: str) -> GuildResponse | None:
    """The guild with this slug (live, else the latest gone one), or None if never stored."""
    async with unit_of_work() as db:
        guild = await guild_repo.get_by_slug(db, slug)
        if guild is None:
            return None
        # A gone guild's members are guildless already; there is nobody to read.
        if guild.gone_at is not None:
            rows, skills = [], []
        else:
            rows = await guild_repo.members(db, guild.id)
            skills = await guild_repo.member_skills(db, guild.id)
    return to_guild_response(guild, rows, skills)
