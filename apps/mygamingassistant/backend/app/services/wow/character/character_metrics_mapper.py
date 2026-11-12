"""A fetched character → the numbers its daily history row stores."""
from __future__ import annotations

from typing import Any

from app.core.wow_character import (
    REPUTATION_TIER_EXALTED,
    STATISTIC_KILLING_BLOWS,
    STATISTIC_TOTAL_DEATHS,
    STATISTIC_TOTAL_KILLS,
)
from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.character.character_achievement_statistics import statistics_by_id
from app.services.wow.character.character_metrics import CharacterMetrics
from app.services.wow.character.character_profession_level import CharacterProfessionLevel


def _statistic(statistics: dict[int, Any] | None, statistic_id: int) -> int | None:
    """A statistic's count; absent from Blizzard's answer = never moved = 0; no answer = None."""
    if statistics is None:
        return None
    entry = statistics.get(statistic_id)
    return 0 if entry is None else entry.quantity


def to_character_metrics(response: CharacterResponse, achievement_statistics: dict[str, Any] | None) -> CharacterMetrics:
    statistics = None if achievement_statistics is None else statistics_by_id(achievement_statistics)
    dungeons = response.dungeons
    reputations = response.reputations
    professions = response.professions
    return CharacterMetrics(
        level=response.level,
        item_level=response.equipped_item_level,
        honorable_kills=None if response.pvp is None else response.pvp.honorable_kills,
        killing_blows=_statistic(statistics, STATISTIC_KILLING_BLOWS),
        deaths_from_players=None if response.pvp is None else response.pvp.deaths_from_players,
        total_kills=_statistic(statistics, STATISTIC_TOTAL_KILLS),
        total_deaths=_statistic(statistics, STATISTIC_TOTAL_DEATHS),
        dungeons_done=None if dungeons is None else sum(1 for d in dungeons.dungeons if (d.kills or 0) > 0),
        exalted_reputations=(
            None if reputations is None else sum(1 for r in reputations if r.tier == REPUTATION_TIER_EXALTED)
        ),
        professions=None if professions is None else tuple(
            CharacterProfessionLevel(profession_id=p.id, skill=p.skill, max_skill=p.max_skill)
            for p in (*professions.primaries, *professions.secondaries)
        ),
    )
