"""A stored ``WowGuild``, its member rows and their skills → ``GuildResponse``."""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from app.core.wow_character import CLASS_NAMES_BY_ID
from app.core.wow_guild import GUILD_GAINS_WINDOW_DAYS, GUILD_REFRESH_COOLDOWN, GUILD_REFRESHABLE_SLUG
from app.models.wow.guild import WowGuild
from app.repositories.wow.guild_member_row import GuildMemberRow
from app.repositories.wow.guild_member_skill_row import GuildMemberSkillRow
from app.schemas.wow.guild.guild_member_baseline_response import GuildMemberBaselineResponse
from app.schemas.wow.guild.guild_member_response import GuildMemberResponse
from app.schemas.wow.guild.guild_member_skill_response import GuildMemberSkillResponse
from app.schemas.wow.guild.guild_response import GuildResponse


def _baseline(row: GuildMemberRow) -> GuildMemberBaselineResponse | None:
    if row.baseline_day is None:
        return None
    return GuildMemberBaselineResponse(
        day=row.baseline_day,
        level=row.baseline_level,
        honorable_kills=row.baseline_honorable_kills,
        killing_blows=row.baseline_killing_blows,
        total_kills=row.baseline_total_kills,
        dungeons_done=row.baseline_dungeons_done,
    )


def to_guild_response(
    guild: WowGuild, rows: Sequence[GuildMemberRow], skills: Sequence[GuildMemberSkillRow],
) -> GuildResponse:
    gone = guild.gone_at is not None
    refresh_failed = guild.last_error is not None and not gone
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
        refresh_failed=refresh_failed,
        refresh_failed_at=guild.last_error_at if refresh_failed else None,
        can_refresh=guild.slug == GUILD_REFRESHABLE_SLUG and not gone,
        refresh_available_at=None if guild.roster_checked_at is None else guild.roster_checked_at + GUILD_REFRESH_COOLDOWN,
        gone=gone,
        gains_window_days=GUILD_GAINS_WINDOW_DAYS,
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
                baseline=_baseline(row),
                professions=skills_by_slug.get(row.slug, []),
                rank=row.rank,
                refreshed_at=row.fetched_at,
            )
            for row in rows
        ],
    )
