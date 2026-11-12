"""A stored ``WowGuild`` and its member rows → ``GuildResponse``."""
from __future__ import annotations

from collections.abc import Sequence

from app.core.wow_character import CLASS_NAMES_BY_ID
from app.models.wow.guild import WowGuild
from app.repositories.wow.guild_member_row import GuildMemberRow
from app.schemas.wow.guild.guild_member_response import GuildMemberResponse
from app.schemas.wow.guild.guild_response import GuildResponse


def to_guild_response(guild: WowGuild, rows: Sequence[GuildMemberRow]) -> GuildResponse:
    gone = guild.gone_at is not None
    return GuildResponse(
        slug=guild.slug,
        name=guild.name,
        faction=guild.faction.lower(),
        roster_size=guild.member_count,
        roster_updated_at=guild.roster_fetched_at,
        refresh_failed=guild.last_error is not None and not gone,
        gone=gone,
        members=[
            GuildMemberResponse(
                slug=row.slug,
                name=row.name,
                surname=row.surname,
                class_name=CLASS_NAMES_BY_ID.get(row.class_id),
                level=row.level,
                item_level=row.item_level,
                rank=row.rank,
                refreshed_at=row.fetched_at,
            )
            for row in rows
        ],
    )
