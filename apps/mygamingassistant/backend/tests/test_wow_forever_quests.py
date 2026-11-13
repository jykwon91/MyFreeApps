"""The Forever dungeon quest build's pure parts: which quest areas, which quests, and each row."""
from __future__ import annotations

from typing import Any

import pytest

from scripts.wow_forever_quests.build import collect_quests
from scripts.wow_forever_quests.quests import COLUMNS, dungeon_areas, is_dungeon_quest, quest_row, standing

AREA_ROWS = [
    {"ID": "16544", "ContinentID": "2999"},  # City of Dalaran, on its own map
    {"ID": "16560", "ContinentID": "2999"},
    {"ID": "16611", "ContinentID": "1"},  # The Shaper's Terrace, in Un'Goro Crater
    {"ID": "2079", "ContinentID": "1"},  # Classic "Blackmaw Hold"
]
QUEST_AREAS = [
    {"id": 16544, "name": "City of Dalaran"},
    {"id": 16560, "name": "Violet Hold"},
    {"id": 16611, "name": "The Shaper's Terrace"},
    {"id": 2079, "name": "Blackmaw Hold"},
    {"id": 1, "name": "Dun Morogh"},
]


def test_areas_on_the_instance_map_and_areas_named_like_it() -> None:
    areas = dungeon_areas(
        [(2999, "City of Dalaran"), (3001, "Shaper's Terrace"), (3002, "Blackmaw Hold")], QUEST_AREAS, AREA_ROWS,
    )
    assert areas[2999] == [16544, 16560]
    # "The" is ignored when matching names.
    assert areas[3001] == [16611]
    assert areas[3002] == [2079]


def test_only_quests_blizzard_types_dungeon_count() -> None:
    # The areas also hold the town's quests (Dalaran's "Special Access", typed nothing; "Unstable Magic", Elite).
    assert is_dungeon_quest({"type": {"id": 81, "name": "Dungeon"}})
    assert not is_dungeon_quest({"type": {"id": 1, "name": "Elite"}})
    assert not is_dungeon_quest({})


def test_reputation_points_name_the_standing() -> None:
    assert standing(0) == "Neutral"
    assert standing(2999) == "Neutral"
    assert standing(3000) == "Friendly"
    assert standing(42000) == "Exalted"
    assert standing(-1) == "Unfriendly"


def test_a_full_quest_becomes_one_row() -> None:
    row = quest_row({
        "id": 96400, "title": "Starving Arcane", "type": {"id": 81, "name": "Dungeon"}, "is_repeatable": True,
        "description": "Line one. \r\n\r\nLine two.  ",
        "requirements": {
            "faction": {"type": "HORDE"},
            "classes": [{"id": 8, "name": "Mage"}],
            "reputations": [{"faction": {"id": 576, "name": "Timbermaw Hold"}, "min_reputation": 0}],
        },
        "rewards": {
            "experience": 3200, "money": {"value": 18000},
            "reputations": [{"reward": {"id": 47, "name": "Ironforge"}, "value": 100}],
            "items": {"items": [{"item": {"id": 279837, "name": "Arcane Band"}}], "choice_of": True},
            "spell": {"id": 1, "name": "Teleport: Dalaran"},
        },
    })
    assert dict(zip(COLUMNS, row, strict=True)) == {
        "id": 96400, "title": "Starving Arcane", "side": "H", "type": "Dungeon", "repeatable": True,
        "classes": ["Mage"], "needsReputation": [["Timbermaw Hold", "Neutral"]], "xp": 3200, "money": 18000,
        "reputations": [["Ironforge", 100]], "items": [[279837, "Arcane Band"]], "itemsChoice": True,
        "spell": "Teleport: Dalaran", "description": "Line one.\n\nLine two.",
    }


def test_a_bare_quest_has_empty_fields() -> None:
    row = dict(zip(COLUMNS, quest_row({"id": 1, "title": "T"}), strict=True))
    assert row["side"] == "N" and row["type"] is None and row["spell"] is None
    assert row["classes"] == [] and row["items"] == [] and row["xp"] == 0 and row["description"] == ""


class _FakeGameData:
    """Blizzard's answers by path: two Dalaran areas; one Dungeon quest each, plus a town quest."""

    def __init__(self, answers: dict[str, dict[str, Any]]) -> None:
        self.answers = answers

    def get(self, url: str) -> dict[str, Any]:
        return self.answers[url]


def _quest(quest_id: int, type_id: int | None) -> dict[str, Any]:
    quest: dict[str, Any] = {"id": quest_id, "title": f"Quest {quest_id}"}
    if type_id is not None:
        quest["type"] = {"id": type_id, "name": "Dungeon" if type_id == 81 else "Elite"}
    return quest


def test_collect_keeps_only_dungeon_quests_once_each_by_id() -> None:
    api = _FakeGameData({
        "/data/wow/quest/area/16544": {"quests": [{"id": 30}, {"id": 10}, {"id": 99}]},
        "/data/wow/quest/area/16560": {"quests": [{"id": 20}, {"id": 10}]},
        "/data/wow/quest/10": _quest(10, 81),
        "/data/wow/quest/20": _quest(20, 81),
        "/data/wow/quest/30": _quest(30, 1),
        "/data/wow/quest/99": _quest(99, None),
    })
    quests = collect_quests(api, [(2999, "City of Dalaran")], QUEST_AREAS, AREA_ROWS)
    assert [row[COLUMNS.index("id")] for row in quests["2999"]] == [10, 20]


def test_collect_stops_when_a_dungeon_has_no_dungeon_quests() -> None:
    api = _FakeGameData({
        "/data/wow/quest/area/16611": {"quests": [{"id": 30}]},
        "/data/wow/quest/30": _quest(30, 1),
    })
    with pytest.raises(SystemExit, match="no Dungeon quests for Shaper's Terrace"):
        collect_quests(api, [(3001, "Shaper's Terrace")], QUEST_AREAS, AREA_ROWS)
