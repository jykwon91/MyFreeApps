"""Quest givers (NPCs and objects such as wanted posters) from cmangos classic-db.

A quest giver is a creature in ``creature_questrelation`` or a game object in
``gameobject_questrelation``; the quest itself is in ``quest_template``. Output
rows are GPL-3.0 (derived from cmangos) — written only to the ``classic/`` data
folder that carries its own LICENSE.
"""
from __future__ import annotations

import math
from collections import defaultdict

from scripts.wow_world_map import sources
from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.factions import ALLIANCE, HORDE, NEUTRAL, FactionTemplate, usable_by
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.placement import place
from scripts.wow_world_map.services import CLASSIC_CONTINENTS, SAME_SPOT_YARDS
from scripts.wow_world_map.sql_dump import read_dump
from scripts.wow_world_map.zones import FOREVER_ONLY_ZONES

QUEST_COLUMNS = ["id", "title", "minLevel", "level", "side", "classes"]
GIVER_COLUMNS = ["guid", "type", "entry", "name", "zone", "subzone", "x", "y", "faction", "quests"]

GIVER_NPC = "npc"
GIVER_OBJECT = "object"

# ChrRaces bitmask (quest_template.RequiredRaces).
_ALLIANCE_RACES = 1 | 4 | 8 | 64  # Human, Dwarf, Night Elf, Gnome
_HORDE_RACES = 2 | 16 | 32 | 128  # Orc, Undead, Tauren, Troll

# ChrClasses bitmask (quest_template.RequiredClasses) -> the frontend's class ids.
_CLASS_BITS = {
    1: "warrior",
    2: "paladin",
    4: "hunter",
    8: "rogue",
    16: "priest",
    64: "shaman",
    128: "mage",
    256: "warlock",
    1024: "druid",
}


def quest_side(required_races: int) -> str | None:
    """Which faction may take a quest: ``A`` / ``H`` / ``N`` (both), None = neither."""
    if required_races == 0:
        return NEUTRAL
    alliance = bool(required_races & _ALLIANCE_RACES)
    horde = bool(required_races & _HORDE_RACES)
    if alliance and horde:
        return NEUTRAL
    if alliance:
        return ALLIANCE
    if horde:
        return HORDE
    return None


def quest_classes(required_classes: int) -> str:
    """Comma-separated class ids, or "" when every class may take it."""
    return ",".join(name for bit, name in _CLASS_BITS.items() if required_classes & bit)


def _giver_faction(template_faction: int, reactions: dict[int, FactionTemplate]) -> str | None:
    # Objects mostly have faction 0: anyone may click them.
    if template_faction == 0:
        return NEUTRAL
    return usable_by(template_faction, reactions)


def build_quests(
    zones: list[ZoneBounds], art: WorldMapArt
) -> tuple[list[list[object]], list[list[object]]]:
    """Return (quest rows, giver rows)."""
    tables = read_dump(
        sources.cmangos_dump(),
        {
            "quest_template",
            "creature_questrelation",
            "gameobject_questrelation",
            "creature",
            "creature_template",
            "gameobject",
            "gameobject_template",
            "game_event_creature",
            "game_event_gameobject",
        },
    )
    reactions = {
        int(r["ID"]): FactionTemplate.from_csv_row(r)
        for r in sources.wago_table("FactionTemplate")
    }

    quests: dict[int, list[object]] = {}
    for q in tables["quest_template"]:
        side = quest_side(int(str(q["RequiredRaces"])))
        if side is None:
            continue
        level = int(str(q["QuestLevel"]))
        min_level = int(str(q["MinLevel"]))
        # QuestLevel -1 = "scales with the player": show it at its minimum.
        quests[int(str(q["entry"]))] = [
            int(str(q["entry"])),
            str(q["Title"]),
            min_level,
            level if level > 0 else min_level,
            side,
            quest_classes(int(str(q["RequiredClasses"]))),
        ]

    offered: dict[tuple[str, int], set[int]] = defaultdict(set)
    for r in tables["creature_questrelation"]:
        if int(str(r["quest"])) in quests:
            offered[(GIVER_NPC, int(str(r["id"])))].add(int(str(r["quest"])))
    for r in tables["gameobject_questrelation"]:
        if int(str(r["quest"])) in quests:
            offered[(GIVER_OBJECT, int(str(r["id"])))].add(int(str(r["quest"])))

    templates: dict[tuple[str, int], tuple[str, int]] = {}
    for r in tables["creature_template"]:
        templates[(GIVER_NPC, int(str(r["Entry"])))] = (str(r["Name"]), int(str(r["Faction"])))
    for r in tables["gameobject_template"]:
        templates[(GIVER_OBJECT, int(str(r["entry"])))] = (str(r["name"]), int(str(r["faction"])))

    event_only = {
        (GIVER_NPC, int(str(r["guid"])))
        for r in tables["game_event_creature"] if int(str(r["event"])) > 0
    } | {
        (GIVER_OBJECT, int(str(r["guid"])))
        for r in tables["game_event_gameobject"] if int(str(r["event"])) > 0
    }

    spawns = [(GIVER_NPC, s) for s in tables["creature"]] + [(GIVER_OBJECT, s) for s in tables["gameobject"]]
    givers: list[list[object]] = []
    placed: dict[tuple[str, int], list[tuple[float, float]]] = {}
    used_quests: set[int] = set()
    for giver_type, spawn in sorted(spawns, key=lambda s: (s[0], int(str(s[1]["guid"])))):
        guid = int(str(spawn["guid"]))
        entry = int(str(spawn["id"]))
        key = (giver_type, entry)
        if key not in offered or (giver_type, guid) in event_only:
            continue
        continent = int(str(spawn["map"]))
        template = templates.get(key)
        if continent not in CLASSIC_CONTINENTS or template is None:
            continue
        name, template_faction = template
        faction = _giver_faction(template_faction, reactions)
        if faction is None:
            continue
        wx, wy = float(str(spawn["position_x"])), float(str(spawn["position_y"]))
        if any(math.hypot(wx - px, wy - py) < SAME_SPOT_YARDS for px, py in placed.get(key, [])):
            continue
        spot = place(zones, art, continent, wx, wy, exclude=FOREVER_ONLY_ZONES)
        if spot is None:
            continue
        placed.setdefault(key, []).append((wx, wy))
        quest_ids = sorted(offered[key])
        used_quests.update(quest_ids)
        givers.append([guid, giver_type, entry, name, *spot.as_row(), faction, quest_ids])

    givers.sort(key=lambda r: (int(str(r[4])), str(r[3]), str(r[1]), int(str(r[0]))))
    quest_rows = [quests[q] for q in sorted(used_quests)]
    return quest_rows, givers
