"""Forever's own dungeons, built from the client's dungeon finder rows."""
from __future__ import annotations

import pytest

from scripts.wow_world_map.forever_dungeons import build_forever_dungeons

TUNING = [
    {"ID": "1", "MinLevelSquish": "28", "MaxLevelSquish": "28"},
    {"ID": "2", "MinLevelSquish": "13", "MaxLevelSquish": "13"},
    {"ID": "3", "MinLevelSquish": "48", "MaxLevelSquish": "48"},
    {"ID": "4", "MinLevelSquish": "0", "MaxLevelSquish": "0"},
]
MAPS = [
    {"ID": "36", "MapName_lang": "Deadmines", "InstanceType": "1"},
    {"ID": "100", "MapName_lang": "City of Dalaran", "InstanceType": "1"},
    {"ID": "101", "MapName_lang": "The Hall of Thanes", "InstanceType": "1"},
    {"ID": "102", "MapName_lang": "Alcaz Prison", "InstanceType": "1"},
    {"ID": "103", "MapName_lang": "Untuned Hold", "InstanceType": "1"},
    {"ID": "104", "MapName_lang": "Some Raid", "InstanceType": "2"},
]
LFG = [
    {"Name_lang": "Deadmines", "ContentTuningID": "1"},
    {"Name_lang": "City of Dalaran", "ContentTuningID": "1"},
    {"Name_lang": "Hall of Thanes", "ContentTuningID": "2"},
    {"Name_lang": "Alcaz Prison", "ContentTuningID": "3"},
    {"Name_lang": "Untuned Hold", "ContentTuningID": "4"},
    {"Name_lang": "Some Raid", "ContentTuningID": "3"},
    {"Name_lang": "Not A Map", "ContentTuningID": "1"},
]
ENCOUNTERS = [
    {"ID": "7", "MapID": "100", "DifficultyID": "1", "OrderIndex": "1", "Name_lang": "Shade of the Archmage"},
    {"ID": "6", "MapID": "100", "DifficultyID": "1", "OrderIndex": "0", "Name_lang": "Atrexis"},
]
AREAS: list[list[object]] = [
    ["City of Dalaran", 1416, 19.4, 73.2, 0, 0],
    ["Alcaz Island", 1445, 77.0, 17.0, 0, 0],
]


def _build(maps: list[dict[str, str]] = MAPS) -> tuple[list[list[object]], dict[str, list[list[object]]]]:
    return build_forever_dungeons(
        lfg_rows=LFG, tuning_rows=TUNING, map_rows=maps,
        encounter_rows=ENCOUNTERS, area_rows=AREAS, classic_instances={36},
    )


def test_lists_only_new_tuned_dungeons_lowest_level_first() -> None:
    rows, _ = _build()
    # Deadmines is Classic, the raid isn't a dungeon, level 0 and unmatched names are left out;
    # "Hall of Thanes" matches the map "The Hall of Thanes".
    assert [r[1] for r in rows] == ["The Hall of Thanes", "City of Dalaran", "Alcaz Prison"]
    assert [r[2] for r in rows] == [13, 28, 48]


def test_area_is_the_label_or_its_override_else_unknown() -> None:
    rows = {r[1]: r for r in _build()[0]}
    assert rows["City of Dalaran"][4:] == [1416, "City of Dalaran", 19.4, 73.2]
    assert rows["Alcaz Prison"][4:] == [1445, "Alcaz Island", 77.0, 17.0]
    assert rows["The Hall of Thanes"][4:] == [None, None, None, None]


def test_bosses_follow_the_game_list_order() -> None:
    _, bosses = _build()
    assert bosses["100"] == [[6, "Atrexis"], [7, "Shade of the Archmage"]]
    assert bosses["101"] == []


def test_two_maps_with_one_name_fail_loud() -> None:
    twin = {"ID": "105", "MapName_lang": "City of Dalaran", "InstanceType": "1"}
    with pytest.raises(ValueError, match="City of Dalaran"):
        _build([*MAPS, twin])
