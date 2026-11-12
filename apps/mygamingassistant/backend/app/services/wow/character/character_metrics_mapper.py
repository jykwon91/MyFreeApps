"""A fetched character → the numbers its daily history row stores."""
from __future__ import annotations

import logging
from typing import Any

from app.core.wow_character import (
    FACTION_NAME_MAX_LENGTH,
    REPUTATION_TIER_EXALTED,
    REPUTATION_TIERS,
    STATISTIC_KILLING_BLOWS,
    STATISTIC_TOTAL_DEATHS,
    STATISTIC_TOTAL_KILLS,
)
from app.schemas.wow.character.character_reputation import CharacterReputation
from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.character.character_achievement_statistics import statistics_by_id
from app.services.wow.character.character_faction_standing import CharacterFactionStanding
from app.services.wow.character.character_metrics import CharacterMetrics
from app.services.wow.character.character_profession_level import CharacterProfessionLevel

logger = logging.getLogger(__name__)


def _statistic(statistics: dict[int, Any] | None, statistic_id: int) -> int | None:
    """A statistic's count; absent from Blizzard's answer = never moved = 0; no answer = None."""
    if statistics is None:
        return None
    entry = statistics.get(statistic_id)
    return 0 if entry is None else entry.quantity


def _standings(reputations: list[CharacterReputation]) -> tuple[CharacterFactionStanding, ...]:
    """One standing per faction (the last one wins if Blizzard repeats a faction), named to fit the table.

    A tier the game doesn't have, or negative progress, breaks the table's checks: logged and left out.
    """
    by_faction: dict[int, CharacterFactionStanding] = {}
    for r in reputations:
        if r.tier not in REPUTATION_TIERS or r.value < 0 or r.max < 0:
            logger.warning(
                "Reputation standing left out: faction=%s tier=%s value=%s max=%s", r.id, r.tier, r.value, r.max,
            )
            continue
        by_faction[r.id] = CharacterFactionStanding(
            faction_id=r.id, faction_name=r.name[:FACTION_NAME_MAX_LENGTH], tier=r.tier, value=r.value, max=r.max,
        )
    return tuple(by_faction.values())


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
        reputations=None if reputations is None else _standings(reputations),
    )
