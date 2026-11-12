"""A stored ``WowGuild``, its member rows and their skills → ``GuildResponse``."""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from app.core.wow_character import CLASS_NAMES_BY_ID
from app.models.wow.guild import WowGuild
from app.repositories.wow.guild_member_row import GuildMemberRow
from app.repositories.wow.guild_member_skill_row import GuildMemberSkillRow
from app.schemas.wow.guild.guild_member_response import GuildMemberResponse
from app.schemas.wow.guild.guild_member_skill_response import GuildMemberSkillResponse
from app.schemas.wow.guild.guild_response import GuildResponse


def to_guild_response(
    guild: WowGuild, rows: Sequence[GuildMemberRow], skills: Sequence[GuildMemberSkillRow],
) -> GuildResponse:
    gone = guild.gone_at is not None
    skills_by_slug: defaultdict[str, list[GuildMemberSkillResponse]] = defaultdict(list)
    for skill in skills:
        skills_by_slug[skill.slug].append(
            GuildMemberSkillResponse(id=skill.profession_id, skill=skill.skill, max_skill=skill.max_skill)
        )
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
                honorable_kills=row.honorable_kills,
                killing_blows=row.killing_blows,
                deaths_from_players=row.deaths_from_players,
                total_kills=row.total_kills,
                total_deaths=row.total_deaths,
                dungeons_done=row.dungeons_done,
                exalted_reputations=row.exalted_reputations,
                professions=skills_by_slug.get(row.slug, []),
                rank=row.rank,
                refreshed_at=row.fetched_at,
            )
            for row in rows
        ],
    )
