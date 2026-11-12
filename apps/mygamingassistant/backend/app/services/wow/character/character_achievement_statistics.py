"""Blizzard's ``/achievements/statistics`` answer, read by statistic id."""
from __future__ import annotations

from typing import Any

from app.services.wow.character.character_json import as_dict, as_float, as_int, as_list, as_str
from app.services.wow.character.character_statistic import CharacterStatistic


def _walk(category: dict[str, Any], found: dict[int, CharacterStatistic]) -> None:
    for raw in as_list(category.get("statistics")):
        entry = as_dict(raw)
        statistic_id = as_int(entry.get("id"))
        quantity = as_float(entry.get("quantity"))
        if statistic_id is not None and quantity is not None:
            found[statistic_id] = CharacterStatistic(quantity=int(quantity), description=as_str(entry.get("description")))
    for sub in as_list(category.get("sub_categories")):
        _walk(as_dict(sub), found)


def statistics_by_id(achievement_statistics: dict[str, Any]) -> dict[int, CharacterStatistic]:
    """Every statistic in the answer, at any depth, by id. One the character never moved is absent."""
    found: dict[int, CharacterStatistic] = {}
    for category in as_list(achievement_statistics.get("categories")):
        _walk(as_dict(category), found)
    return found
