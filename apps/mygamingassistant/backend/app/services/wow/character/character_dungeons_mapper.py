"""Blizzard's ``/achievements/statistics`` → ``CharacterDungeons``."""
from __future__ import annotations

from typing import Any

from app.core.wow_character import STATISTIC_DUNGEONS_ENTERED
from app.schemas.wow.character.character_dungeon import CharacterDungeon
from app.schemas.wow.character.character_dungeons import CharacterDungeons
from app.services.wow.character.character_achievement_statistics import statistics_by_id
from app.services.wow.character.character_dungeon_definition import CharacterDungeonDefinition
from app.services.wow.character.character_dungeon_table import character_dungeon_table
from app.services.wow.character.character_statistic import CharacterStatistic


def _kills(definition: CharacterDungeonDefinition, statistics: dict[int, CharacterStatistic]) -> int | None:
    """The final boss's kills; a boss counted under two ids is one boss, so the larger count, not the sum."""
    if not definition.statistic_ids:
        return None
    return max((statistics[i].quantity if i in statistics else 0) for i in definition.statistic_ids)


def to_character_dungeons(achievement_statistics: dict[str, Any] | None) -> CharacterDungeons | None:
    """None when Blizzard failed on the statistics — never every dungeon "not done"."""
    if achievement_statistics is None:
        return None
    statistics = statistics_by_id(achievement_statistics)
    runs = statistics.get(STATISTIC_DUNGEONS_ENTERED)
    return CharacterDungeons(
        runs=runs.quantity if runs else 0,
        dungeons=[
            CharacterDungeon(
                name=d.name,
                wing=d.wing,
                classic=d.classic,
                boss=d.boss,
                kills=_kills(d, statistics),
                level_min=d.level_min,
                level_max=d.level_max,
                required_level=d.required_level,
            )
            for d in character_dungeon_table()
        ],
    )
