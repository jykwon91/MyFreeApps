"""Blizzard's ``/pvp-summary`` + ``/achievements/statistics`` → ``CharacterPvp``."""
from __future__ import annotations

from typing import Any

from app.core.wow_character import (
    STATISTIC_DEATHS_FROM_OPPOSITE_FACTION,
    STATISTIC_DEATHS_FROM_PLAYERS,
    STATISTIC_TOP_HONOR_CONTINENT,
)
from app.schemas.wow.character.character_pvp import CharacterPvp
from app.services.wow.character.character_achievement_statistics import statistics_by_id
from app.services.wow.character.character_json import as_int
from app.services.wow.character.character_statistic import CharacterStatistic


def _count(statistics: dict[int, CharacterStatistic] | None, statistic_id: int) -> int | None:
    """None when the statistics weren't sent; 0 when the character never moved this one."""
    if statistics is None:
        return None
    found = statistics.get(statistic_id)
    return found.quantity if found else 0


def to_character_pvp(pvp_summary: dict[str, Any] | None, achievement_statistics: dict[str, Any] | None) -> CharacterPvp | None:
    """None only when Blizzard failed on ``/pvp-summary``; a character with no PvP has zeros."""
    if pvp_summary is None:
        return None
    statistics = None if achievement_statistics is None else statistics_by_id(achievement_statistics)
    continent = (statistics or {}).get(STATISTIC_TOP_HONOR_CONTINENT)
    if continent is not None and (continent.description is None or continent.quantity <= 0):
        continent = None
    return CharacterPvp(
        rank=max(as_int(pvp_summary.get("pvp_rank")) or 0, 0),
        honorable_kills=max(as_int(pvp_summary.get("honorable_kills")) or 0, 0),
        deaths_from_players=_count(statistics, STATISTIC_DEATHS_FROM_PLAYERS),
        deaths_from_opposite_faction=_count(statistics, STATISTIC_DEATHS_FROM_OPPOSITE_FACTION),
        top_honor_continent=continent.description if continent else None,
        top_honor_continent_kills=continent.quantity if continent else None,
    )
