"""Dungeon and raid entrances.

Which area trigger teleports into which instance comes from cmangos
classic-db's ``areatrigger_teleport`` (GPL-3.0 — output goes to the
``classic/`` folder). The trigger's position comes from the Classic Era
client's ``AreaTrigger`` (the Forever client no longer ships these). The
instance's name and type (``Map``) and its Forever level (``LFGDungeons`` ->
``ContentTuning``) come from the Forever client tables.

Forever tunes each dungeon to one level (Wailing Caverns 17, Deadmines 16,
...), so ``minLevel`` usually equals ``maxLevel``. ``LFGDungeons.MapID`` is 0
in this client, so levels are matched by name through ``_LFG_NAMES``; raids
the table doesn't list are level 60.
"""
from __future__ import annotations

import math

from scripts.wow_world_map import sources
from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.placement import place
from scripts.wow_world_map.services import CLASSIC_CONTINENTS
from scripts.wow_world_map.sql_dump import read_dump
from scripts.wow_world_map.zones import FOREVER_ONLY_ZONES

COLUMNS = [
    "trigger", "instance", "name", "wing", "type",
    "minLevel", "maxLevel", "requiredLevel", "zone", "subzone", "x", "y",
]

DUNGEON = "dungeon"
RAID = "raid"
_INSTANCE_TYPES = {"1": DUNGEON, "2": RAID}

MAX_LEVEL = 60

# Wing / door labels, by trigger id. Triggers not listed have no wing.
_WINGS = {
    45: "Graveyard",
    610: "Cathedral",
    612: "Armory",
    614: "Library",
    523: "Train depot",
    902: "Back door",
    2214: "Service entrance",
    2216: "Main gate",
    2217: "Main gate",
    3133: "Orange",
    3134: "Purple",
    3183: "East",
    3185: "East, back door",
    3186: "West",
    3187: "West, side door",
    3189: "North",
}

# Instance map id (or (map id, wing)) -> LFGDungeons names whose levels apply.
_LFG_NAMES: dict[object, tuple[str, ...]] = {
    389: ("Ragefire Chasm",),
    36: ("Deadmines",),
    43: ("Wailing Caverns",),
    33: ("Shadowfang Keep",),
    48: ("Blackfathom Deeps",),
    34: ("Stormwind Stockades",),
    90: ("Gnomeregan",),
    47: ("Razorfen Kraul",),
    189: ("Scarlet Monastery",),
    129: ("Razorfen Downs",),
    70: ("Uldaman",),
    209: ("Zul'Farak",),
    349: ("Maraudon",),
    109: ("Sunken Temple",),
    230: ("Blackrock Depths",),
    229: ("Lower Blackrock Spire", "Upper Blackrock Spire"),
    329: ("Stratholme",),
    289: ("Scholomance",),
    (429, "East"): ("Dire Maul - East",),
    (429, "East, back door"): ("Dire Maul - East",),
    (429, "West"): ("Dire Maul - West",),
    (429, "West, side door"): ("Dire Maul - West",),
    (429, "North"): ("Dire Maul - North",),
    429: ("Dire Maul - East", "Dire Maul - West", "Dire Maul - North"),
    309: ("Zul'Gurub",),
    249: ("Onyxia",),
    409: ("Molten Core",),
    469: ("Blackwing Lair",),
}

# Two triggers into the same instance + wing closer than this are one entrance.
_SAME_ENTRANCE_YARDS = 60.0


def _level_range(
    instance: int, wing: str, kind: str, lfg: dict[str, tuple[int, int]], required: int
) -> tuple[int, int]:
    names = _LFG_NAMES.get((instance, wing)) or _LFG_NAMES.get(instance, ())
    ranges = [lfg[n] for n in names if n in lfg]
    if ranges:
        return min(r[0] for r in ranges), max(r[1] for r in ranges)
    if kind == RAID:
        return MAX_LEVEL, MAX_LEVEL
    return max(required, 1), MAX_LEVEL


def build_dungeons(zones: list[ZoneBounds], art: WorldMapArt) -> list[list[object]]:
    teleports = read_dump(sources.cmangos_dump(), {"areatrigger_teleport"})["areatrigger_teleport"]
    maps = {int(r["ID"]): r for r in sources.wago_table("Map")}
    triggers = {
        int(r["ID"]): r
        for r in sources.wago_table(
            "AreaTrigger", branch=sources.WAGO_ERA_BRANCH, build=sources.WAGO_ERA_BUILD
        )
    }
    tuning = {r["ID"]: r for r in sources.wago_table("ContentTuning")}
    lfg: dict[str, tuple[int, int]] = {}
    for r in sources.wago_table("LFGDungeons"):
        ct = tuning.get(r["ContentTuningID"])
        if ct is not None and int(ct["MinLevelSquish"]) > 0:
            lfg[r["Name_lang"]] = (int(ct["MinLevelSquish"]), int(ct["MaxLevelSquish"]))

    rows: list[list[object]] = []
    seen: list[tuple[int, str, float, float]] = []
    # instance map id -> its first world entrance (placement row + name).
    entrances: dict[int, tuple[list[object], str]] = {}
    nested: list[tuple[int, int, int, str]] = []
    for tp in sorted(teleports, key=lambda r: int(str(r["id"]))):
        trigger_id = int(str(tp["id"]))
        instance = int(str(tp["target_map"]))
        target = maps.get(instance)
        trigger = triggers.get(trigger_id)
        if target is None or trigger is None:
            continue
        kind = _INSTANCE_TYPES.get(target["InstanceType"])
        if kind is None:
            continue
        continent = int(trigger["ContinentID"])
        required = int(str(tp["required_level"]))
        if continent not in CLASSIC_CONTINENTS:
            # Inside another instance (Blackwing Lair is reached through
            # Blackrock Spire): resolved after the world entrances.
            if continent != instance:
                nested.append((trigger_id, instance, continent, kind))
            continue
        wx, wy = float(trigger["Pos_0"]), float(trigger["Pos_1"])
        wing = _WINGS.get(trigger_id, "")
        if any(
            i == instance and w == wing and math.hypot(wx - x, wy - y) < _SAME_ENTRANCE_YARDS
            for i, w, x, y in seen
        ):
            continue
        spot = place(zones, art, continent, wx, wy, exclude=FOREVER_ONLY_ZONES)
        if spot is None:
            continue
        seen.append((instance, wing, wx, wy))
        low, high = _level_range(instance, wing, kind, lfg, required)
        placement = spot.as_row()
        entrances.setdefault(instance, (placement, target["MapName_lang"]))
        rows.append([
            trigger_id, instance, target["MapName_lang"], wing, kind, low, high, required, *placement,
        ])

    for trigger_id, instance, parent, kind in nested:
        # Only when the instance has no world entrance of its own (the
        # Molten Core also has one from Blackrock Mountain).
        if instance in entrances or parent not in entrances:
            continue
        placement, parent_name = entrances[parent]
        required = next(int(str(t["required_level"])) for t in teleports if int(str(t["id"])) == trigger_id)
        wing = f"Inside {parent_name}"
        low, high = _level_range(instance, wing, kind, lfg, required)
        entrances[instance] = (placement, maps[instance]["MapName_lang"])
        rows.append([
            trigger_id, instance, maps[instance]["MapName_lang"], wing, kind, low, high, required, *placement,
        ])

    rows.sort(key=lambda r: (int(str(r[5])), str(r[2]), str(r[3])))
    return rows
