"""Dungeon and raid interiors: where you come in, where each boss stands, and
which doors on the way need a key.

* **Bosses** and their order are the Forever client's ``DungeonEncounter``
  rows for the instance map. Each is placed at the cmangos classic-db
  (GPL-3.0) spawn of the creature with that name on the map — an encounter
  named after a group ("The Seven") or a boss that only shows up when
  another dies (Sneed out of his Shredder) is placed at the creature that
  stands for it (``_STAND_INS``). A spawn that picks its creature from a
  list (``creature_spawn_entry``, spawn groups) counts for each of them.
  A boss with no spawn (summoned, or brought out by an event) keeps no
  position; the page says so instead of guessing.
* **Entrances** are where each entrance's teleport (cmangos
  ``areatrigger_teleport``) puts you inside: one per ``classicDungeons.json`` row.
* **Locked doors**: cmangos door gameobjects whose lock (``Lock``, Forever
  client) opens with an item — the key's name from cmangos ``item_template``.
  Doors opened by events or levers aren't listed, nor cells, cages and
  coffers (``_NOT_A_WAY``) — nobody walks through those.

Output goes to the GPL ``classic/`` folder, like the other cmangos-derived data.
"""
from __future__ import annotations

import re
from collections import defaultdict

from scripts.wow_world_map import sources
from scripts.wow_world_map.sql_dump import SqlValue, read_dump

BOSS_COLUMNS = ["encounter", "name", "x", "y", "z", "spots"]
DOOR_COLUMNS = ["x", "y", "z", "key"]
ENTRANCE_COLUMNS = ["trigger", "x", "y", "z"]

GO_TYPE_DOOR = 0
LOCK_KEY_ITEM = 1  # Lock.Type_N: the slot opens with an item

# Encounters named after a group or a room: the creature that stands for it.
_STAND_INS = {
    "Sneed": "Sneed's Shredder",
    "Ring of Law": "High Justice Grimstone",
    "The Seven": "Doom'rel",
    "The Vault": "Watchman Doomgrip",
    "The Lost Dwarves": "Baelog",
    "Balnazzar": "Grand Crusader Dathrohan",
    "Nefarian": "Lord Victor Nefarius",
    "Silithid Royalty": "Princess Yauj",
    "Twin Emperors": "Emperor Vek'lor",
    "The Four Horsemen": "Thane Korth'azz",
}

# Maps whose encounters are listed for more than one difficulty: the
# 5-player one (Gnomeregan also lists its Season of Discovery raid, 198).
_DIFFICULTY = {90: 201}


def _encounters(instances: set[int]) -> dict[int, list[tuple[int, str]]]:
    """``(encounter id, name)`` per map, in the client's order."""
    rows: dict[int, list[tuple[int, int, str]]] = defaultdict(list)
    for r in sources.wago_table("DungeonEncounter"):
        map_id = int(r["MapID"])
        if map_id in instances and int(r["DifficultyID"]) == _DIFFICULTY.get(map_id, 0):
            rows[map_id].append((int(r["OrderIndex"]), int(r["ID"]), r["Name_lang"].strip()))
    return {m: [(e, n) for _, e, n in sorted(v)] for m, v in rows.items()}


def _spawns(tables: dict[str, list[dict[str, SqlValue]]], instances: set[int]) -> dict[tuple[int, str], list[tuple[float, float, float]]]:
    """Creature spawn positions by (map, lower-case name), in guid order."""
    names = {r["Entry"]: str(r["Name"]) for r in tables["creature_template"]}
    # A spawn with id 0 picks its creature from creature_spawn_entry, or from
    # the creatures of the spawn group it belongs to.
    pooled: dict[SqlValue, list[SqlValue]] = defaultdict(list)
    for r in tables["creature_spawn_entry"]:
        pooled[r["guid"]].append(r["entry"])
    group_entries: dict[SqlValue, list[SqlValue]] = defaultdict(list)
    for r in tables["spawn_group_entry"]:
        group_entries[r["Id"]].append(r["Entry"])
    for r in tables["spawn_group_spawn"]:
        pooled[r["Guid"]] += group_entries.get(r["Id"], [])
    out: dict[tuple[int, str], list[tuple[float, float, float]]] = defaultdict(list)
    for c in sorted(tables["creature"], key=lambda r: int(str(r["guid"]))):
        map_id = int(str(c["map"]))
        if map_id not in instances:
            continue
        entries = [c["id"]] if c["id"] else pooled.get(c["guid"], [])
        spot = (float(str(c["position_x"])), float(str(c["position_y"])), float(str(c["position_z"])))
        for entry in entries:
            if entry in names:
                out[(map_id, names[entry].lower())].append(spot)
    return out


def _bosses(map_id: int, encounters: list[tuple[int, str]], spawns: dict) -> list[list[object]]:
    rows: list[list[object]] = []
    for encounter, name in encounters:
        spots = spawns.get((map_id, _STAND_INS.get(name, name).lower()), [])
        if spots:
            x, y, z = spots[0]
            rows.append([encounter, name, round(x, 1), round(y, 1), round(z, 1), len(spots)])
        else:
            rows.append([encounter, name, None, None, None, 0])
    return rows


# Locked "doors" that shut something away rather than a way through
# (Blackrock Depths' prison cells and relic coffers, Zul'Farrak's troll cages).
_NOT_A_WAY = re.compile(r"\b(Cell|Cage|Coffer)\b")


def _doors(tables: dict[str, list[dict[str, SqlValue]]], instances: set[int]) -> dict[int, list[list[object]]]:
    templates = {r["entry"]: r for r in tables["gameobject_template"]
                 if r["type"] == GO_TYPE_DOOR and not _NOT_A_WAY.search(str(r["name"]))}
    items = {r["entry"]: str(r["name"]) for r in tables["item_template"]}
    keys: dict[int, int] = {}
    for r in sources.wago_table("Lock"):
        if int(r["Type_0"]) == LOCK_KEY_ITEM and int(r["_Index_0"]):
            keys[int(r["ID"])] = int(r["_Index_0"])
    out: dict[int, list[list[object]]] = defaultdict(list)
    for go in sorted(tables["gameobject"], key=lambda r: int(str(r["guid"]))):
        map_id = int(str(go["map"]))
        template = templates.get(go["id"])
        if map_id not in instances or template is None:
            continue
        key = keys.get(int(str(template["data1"])))
        if key is None or key not in items:
            continue
        out[map_id].append([
            round(float(str(go["position_x"])), 1), round(float(str(go["position_y"])), 1),
            round(float(str(go["position_z"])), 1), items[key],
        ])
    return out


def build_interiors(dungeon_rows: list[list[object]], dungeon_columns: list[str]) -> dict[str, dict[str, list]]:
    """Per instance map id: its entrances, bosses and locked doors."""
    trigger_col, instance_col = dungeon_columns.index("trigger"), dungeon_columns.index("instance")
    entrance_triggers: dict[int, list[int]] = defaultdict(list)
    for row in dungeon_rows:
        entrance_triggers[int(str(row[instance_col]))].append(int(str(row[trigger_col])))
    instances = set(entrance_triggers)
    tables = read_dump(sources.cmangos_dump(), {
        "areatrigger_teleport", "creature", "creature_template", "creature_spawn_entry",
        "spawn_group_entry", "spawn_group_spawn",
        "gameobject", "gameobject_template", "item_template",
    })
    teleports = {int(str(r["id"])): r for r in tables["areatrigger_teleport"]}
    encounters = _encounters(instances)
    spawns = _spawns(tables, instances)
    doors = _doors(tables, instances)
    out: dict[str, dict[str, list]] = {}
    for map_id in sorted(instances):
        entrances = []
        for trigger in entrance_triggers[map_id]:
            tp = teleports[trigger]
            entrances.append([trigger, *(round(float(str(tp[f"target_position_{a}"])), 1) for a in "xyz")])
        bosses = _bosses(map_id, encounters.get(map_id, []), spawns)
        if not bosses:
            continue
        out[str(map_id)] = {"entrances": entrances, "bosses": bosses, "doors": doors.get(map_id, [])}
    return out
