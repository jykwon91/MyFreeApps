"""Guild help tab: return each live member's equipped items, recipe ability ids, and talents.

The frontend does all matching and scoring client-side.  The service only reads
the stored sheets (already in the DB) and projects what the tab needs.  Members
whose sheet is stale (wrong version) or missing are silently skipped — they just
won't appear in the matcher.
"""
from __future__ import annotations

from app.db.session import unit_of_work
from app.repositories.wow import guild_repo
from app.schemas.wow.guild.guild_help_response import GuildHelpMember, GuildHelpResponse
from app.services.wow.guild.guild_help_mapper import help_member_from_row


async def get_help(slug: str) -> GuildHelpResponse | None:
    """The guild help data for every live member, or None when the guild isn't stored."""
    async with unit_of_work() as db:
        guild = await guild_repo.get_by_slug(db, slug)
        if guild is None:
            return None
        if guild.gone_at is not None:
            return GuildHelpResponse(members=[])
        rows = await guild_repo.member_sheets(db, guild.id)

    members: list[GuildHelpMember] = []
    for row in rows:
        member = help_member_from_row(row)
        if member is not None:
            members.append(member)

    return GuildHelpResponse(members=members)
