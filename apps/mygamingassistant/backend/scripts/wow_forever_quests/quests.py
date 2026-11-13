"""Which Game Data API quests belong to which new Forever dungeon, and each one as a row.

Blizzard's Game Data API files every quest under a quest area
(``/data/wow/quest/area/{id}``). A dungeon's quests are the ones Blizzard types
"Dungeon" (81) in its quest areas:

* every area on the dungeon's own instance map (``AreaTable`` ``ContinentID`` =
  the instance — City of Dalaran has two), and
* an area elsewhere that has the dungeon's name (The Shaper's Terrace's sits in
  Un'Goro Crater).

The type check matters: those areas also hold the surrounding town's or zone's
quests (Dalaran's city quests, Classic "Blackmaw Hold"'s cloth donations).
Nothing here guesses a level, giver or objective: the API has none of them.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

COLUMNS = [
    "id", "title", "side", "type", "repeatable", "classes", "needsReputation",
    "xp", "money", "reputations", "items", "itemsChoice", "spell", "description",
]

DUNGEON_QUEST_TYPE = 81
# The pages' faction letters (``FACTION``): Alliance, Horde, or both.
_SIDES = {"ALLIANCE": "A", "HORDE": "H"}
_BOTH_SIDES = "N"
# Reputation needed, as Blizzard gives it (points), to the standing the game names.
_STANDINGS = [
    (42000, "Exalted"), (21000, "Revered"), (9000, "Honored"), (3000, "Friendly"),
    (0, "Neutral"), (-3000, "Unfriendly"), (-6000, "Hostile"), (-42000, "Hated"),
]


def _bare(name: str) -> str:
    return name.removeprefix("The ").strip().lower()


def _text(value: object) -> str:
    """Quest text without Windows line ends or trailing spaces."""
    lines = str(value or "").replace("\r\n", "\n").split("\n")
    return "\n".join(line.rstrip() for line in lines).strip()


def standing(points: int) -> str:
    """The standing a reputation of ``points`` is in (0 = Neutral)."""
    return next((name for floor, name in _STANDINGS if points >= floor), "Hated")


def dungeon_areas(
    dungeons: Iterable[tuple[int, str]],
    quest_areas: Iterable[Mapping[str, Any]],
    area_rows: Iterable[Mapping[str, str]],
) -> dict[int, list[int]]:
    """Per instance, its quest area ids: on its map, or elsewhere with its name."""
    continent = {int(r["ID"]): int(r["ContinentID"]) for r in area_rows}
    areas = [(int(a["id"]), _bare(str(a["name"]))) for a in quest_areas]
    return {
        instance: sorted(area for area, label in areas if continent.get(area) == instance or label == _bare(name))
        for instance, name in dungeons
    }


def is_dungeon_quest(quest: Mapping[str, Any]) -> bool:
    """Blizzard types it "Dungeon"; anything else in the area is the town's or zone's."""
    return int((quest.get("type") or {}).get("id", 0)) == DUNGEON_QUEST_TYPE


def quest_row(quest: Mapping[str, Any]) -> list[object]:
    """One quest answer as a row (``COLUMNS``)."""
    needs = quest.get("requirements") or {}
    rewards = quest.get("rewards") or {}
    items = rewards.get("items") or {}
    quest_type = quest.get("type")
    spell = rewards.get("spell")
    return [
        int(quest["id"]),
        str(quest["title"]),
        _SIDES.get(str((needs.get("faction") or {}).get("type", "")), _BOTH_SIDES),
        str(quest_type["name"]) if quest_type else None,
        bool(quest.get("is_repeatable", False)),
        [str(c["name"]) for c in needs.get("classes") or []],
        [[str(r["faction"]["name"]), standing(int(r["min_reputation"]))] for r in needs.get("reputations") or []],
        int(rewards.get("experience", 0)),
        int((rewards.get("money") or {}).get("value", 0)),
        [[str(r["reward"]["name"]), int(r["value"])] for r in rewards.get("reputations") or []],
        [[int(i["item"]["id"]), str(i["item"]["name"])] for i in items.get("items") or []],
        bool(items.get("choice_of", False)),
        str(spell["name"]) if spell else None,
        _text(quest.get("description")),
    ]
