"""WoW Forever's own dungeons — the ones the Classic server dump never had.

``classicDungeons.json`` lists a dungeon only when cmangos classic-db has a
teleport into it, so a dungeon Forever added (City of Dalaran, Ruins of
Lordaeron, ...) can't be there. This file lists them from the Forever client
alone, so it isn't GPL and sits outside ``classic/``:

* which dungeons: the client's dungeon finder (``LFGDungeons``) rows whose
  instance (``Map``, matched by name — ``LFGDungeons.MapID`` is 0 in this
  client) is a dungeon the Classic file doesn't already list. That leaves out
  maps the client carries but the finder doesn't offer (Demon Fall Canyon,
  Karazhan Crypts, Manor Mistmantle).
* levels: ``LFGDungeons`` -> ``ContentTuning``.
* bosses: ``DungeonEncounter``, in the client's list order.
* where: the client has no entrance trigger for them, so only the named area
  the game puts the dungeon in, when it has one (``areas.json``, the World
  Map's area labels). That's an area, never a door.
"""
from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from pathlib import Path

from scripts.wow_world_map import sources
from scripts.wow_world_map.interiors import encounters_by_map

COLUMNS = ["instance", "name", "minLevel", "maxLevel", "zone", "area", "x", "y"]
BOSS_COLUMNS = ["encounter", "name"]

_DUNGEON_INSTANCE_TYPE = "1"

# The area label a dungeon's area goes by, when it isn't the dungeon's own name.
_AREA_NAMES = {
    "Alcaz Prison": "Alcaz Island",
}


def _bare(name: str) -> str:
    """Names match with or without a leading "The" (LFG "Hall of Thanes", Map "The Hall of Thanes")."""
    return name.removeprefix("The ").strip().lower()


def build_forever_dungeons(
    *,
    lfg_rows: Iterable[dict[str, str]],
    tuning_rows: Iterable[dict[str, str]],
    map_rows: Iterable[dict[str, str]],
    encounter_rows: Iterable[dict[str, str]],
    area_rows: Iterable[list[object]],
    classic_instances: set[int],
) -> tuple[list[list[object]], dict[str, list[list[object]]]]:
    """The dungeon rows (lowest level first) and each one's bosses, by instance id."""
    tuning = {r["ID"]: r for r in tuning_rows}
    dungeon_maps: dict[str, dict[str, str]] = {}
    for r in map_rows:
        if r["InstanceType"] != _DUNGEON_INSTANCE_TYPE or int(r["ID"]) in classic_instances:
            continue
        key = _bare(r["MapName_lang"])
        if key in dungeon_maps:
            raise ValueError(f"two dungeon maps are both named {r['MapName_lang']!r}: can't tell which one LFGDungeons means")
        dungeon_maps[key] = r
    areas: dict[str, list[object]] = {}
    for row in area_rows:
        areas.setdefault(str(row[0]), row)

    found: list[tuple[int, str, int, int]] = []
    for r in lfg_rows:
        target = dungeon_maps.get(_bare(r["Name_lang"]))
        ct = tuning.get(r["ContentTuningID"])
        if target is None or ct is None or int(ct["MinLevelSquish"]) <= 0:
            continue
        found.append((int(target["ID"]), target["MapName_lang"], int(ct["MinLevelSquish"]), int(ct["MaxLevelSquish"])))

    encounters = encounters_by_map(encounter_rows, {instance for instance, *_ in found})
    rows: list[list[object]] = []
    bosses: dict[str, list[list[object]]] = {}
    for instance, name, low, high in sorted(found, key=lambda f: (f[2], f[1])):
        area = areas.get(_AREA_NAMES.get(name, name))
        where = [area[1], area[0], area[2], area[3]] if area else [None, None, None, None]
        rows.append([instance, name, low, high, *where])
        bosses[str(instance)] = [[encounter, boss] for encounter, boss in encounters.get(instance, [])]
    return rows, bosses


def write_forever_dungeons(data_dir: Path, write_json: Callable[[Path, object], None], source: dict[str, object]) -> int:
    """Write ``foreverDungeons.json`` from the client tables and the committed area labels / Classic entrances."""
    areas = json.loads((data_dir / "areas.json").read_text(encoding="utf-8"))["rows"]
    classic = json.loads((data_dir / "classic" / "classicDungeons.json").read_text(encoding="utf-8"))
    instance_at = classic["columns"].index("instance")
    rows, bosses = build_forever_dungeons(
        lfg_rows=sources.wago_table("LFGDungeons"),
        tuning_rows=sources.wago_table("ContentTuning"),
        map_rows=sources.wago_table("Map"),
        encounter_rows=sources.wago_table("DungeonEncounter"),
        area_rows=areas,
        classic_instances={int(r[instance_at]) for r in classic["rows"]},
    )
    write_json(data_dir / "foreverDungeons.json", {
        "source": {**source, "tables": "LFGDungeons, ContentTuning, Map, DungeonEncounter; areas from areas.json"},
        "columns": COLUMNS,
        "bossColumns": BOSS_COLUMNS,
        "rows": rows,
        "bosses": bosses,
    })
    return len(rows)

