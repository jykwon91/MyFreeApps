"""Ground dangerous to one faction's walker: the other faction's towns and home zones.

Every creature of the other player faction (its FactionTemplate in the
Alliance or Horde group) hostile to one of the walker's races marks the
ground around its spawn — guards and fighters, whatever their level (a small
camp's are level 25-40), but not civilians: a lone quest giver by a road
never attacks. The spawns come from cmangos classic-db (Kalimdor and the
Eastern Kingdoms only).

The other faction's home zones (The Barrens, Mulgore, Elwynn Forest, ...:
``AreaTable.FactionGroupMask``) are milder danger: no guards, but their
players and patrols.

A step on dangerous ground counts ``HOSTILE_FACTOR`` (a town) or
``TERRITORY_FACTOR`` (a home zone) times for that walker, both when picking
the path and when the trip planner weighs walking against a boat or a
flight, so a route goes around a town and keeps to its own side's ground,
but still reaches a spot inside one (``export.py``, ``walkGraph.ts``).
"""
from __future__ import annotations

import numpy as np

from scripts.wow_world_map import sources
from scripts.wow_world_map.factions import (
    ALLIANCE,
    ALLIANCE_RACE_TEMPLATES,
    HORDE,
    HORDE_RACE_TEMPLATES,
    FactionTemplate,
    is_hostile,
)
from scripts.wow_world_map.sql_dump import read_dump

# Node flag bits (export.py), for that faction's walker: ground near the other
# faction's guards, and ground in the other faction's home zones.
HOSTILE_TO = {ALLIANCE: 2, HORDE: 4}
ENEMY_TERRITORY = {ALLIANCE: 8, HORDE: 16}
# Guards notice you from up to ~40 yd and patrol a beat around their spawn.
HOSTILE_RADIUS = 100.0
HOSTILE_DZ = 30.0  # a camp on a cliff top leaves the valley under it alone
# A yard on hostile ground costs this many: a route detours up to ~10x a
# town's width to go around it.
HOSTILE_FACTOR = 10.0
TERRITORY_FACTOR = 3.0

# The other faction's group bit (FactionTemplate.FactionGroup, AreaTable.FactionGroupMask):
# 2 Alliance, 4 Horde.
_ENEMY_GROUP = {ALLIANCE: 4, HORDE: 2}
_RACES = {ALLIANCE: ALLIANCE_RACE_TEMPLATES, HORDE: HORDE_RACE_TEMPLATES}
CLASSIC_CONTINENTS = (0, 1)


def _is_enemy(template: FactionTemplate, faction: str, reactions: dict[int, FactionTemplate]) -> bool:
    if not template.faction_group & _ENEMY_GROUP[faction]:
        return False
    return any(is_hostile(template, reactions[race]) for race in _RACES[faction])


def hostile_spawns(map_id: int) -> dict[str, np.ndarray]:
    """Faction -> (k, 3) world positions of creatures hostile to its walker on ``map_id``."""
    out = {f: np.zeros((0, 3)) for f in HOSTILE_TO}
    if map_id not in CLASSIC_CONTINENTS:
        return out
    tables = read_dump(sources.cmangos_dump(), {"creature", "creature_template", "game_event_creature"})
    reactions = {int(r["ID"]): FactionTemplate.from_csv_row(r) for r in sources.wago_table("FactionTemplate")}
    event_only = {int(str(r["guid"])) for r in tables["game_event_creature"] if int(str(r["event"])) > 0}
    enemy_of: dict[int, list[str]] = {}
    for r in tables["creature_template"]:
        template = reactions.get(int(str(r["Faction"])))
        if template is not None and not int(str(r["Civilian"])):
            enemy_of[int(str(r["Entry"]))] = [f for f in HOSTILE_TO if _is_enemy(template, f, reactions)]
    spots: dict[str, list[tuple[float, float, float]]] = {f: [] for f in HOSTILE_TO}
    for s in tables["creature"]:
        if int(str(s["map"])) != map_id or int(str(s["guid"])) in event_only:
            continue
        for faction in enemy_of.get(int(str(s["id"])), []):
            spots[faction].append((float(str(s["position_x"])), float(str(s["position_y"])), float(str(s["position_z"]))))
    return {f: np.array(p, dtype=float).reshape(-1, 3) for f, p in spots.items()}


def hostile_flags(position: np.ndarray, spawns: dict[str, np.ndarray]) -> np.ndarray:
    """(n,) u8: ``HOSTILE_TO`` bits of the nodes within ``HOSTILE_RADIUS`` of a hostile spawn."""
    flags = np.zeros(len(position), dtype=np.uint8)
    node_cell = [tuple(c) for c in np.floor(position[:, :2] / HOSTILE_RADIUS).astype(np.int64).tolist()]
    for faction, spots in spawns.items():
        # Only nodes in a spawn's grid cell or the 8 around it can be in reach.
        cells = {(cx + dx, cy + dy)
                 for cx, cy in np.floor(spots[:, :2] / HOSTILE_RADIUS).astype(np.int64).tolist()
                 for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
        near = np.flatnonzero([c in cells for c in node_cell])
        p = position[near]
        hit = np.zeros(len(near), dtype=bool)
        for x, y, z in spots:
            hit |= (np.hypot(p[:, 0] - x, p[:, 1] - y) <= HOSTILE_RADIUS) & (np.abs(p[:, 2] - z) <= HOSTILE_DZ)
        flags[near[hit]] |= HOSTILE_TO[faction]
    return flags


def territory_flags(zones: list[str], map_id: int) -> np.ndarray:
    """(len(zones),) u8: ``ENEMY_TERRITORY`` bits of each zone name (a walk label's zone)."""
    mask = {
        r["AreaName_lang"].strip(): int(r["FactionGroupMask"])
        for r in sources.wago_table("AreaTable")
        if int(r["ParentAreaID"]) == 0 and int(r["ContinentID"]) == map_id
    }
    flags = np.zeros(len(zones), dtype=np.uint8)
    for i, zone in enumerate(zones):
        for faction, bit in ENEMY_TERRITORY.items():
            if mask.get(zone, 0) & _ENEMY_GROUP[faction]:
                flags[i] |= bit
    return flags


def danger_factor(flags: np.ndarray, faction: str | None) -> np.ndarray:
    """What a yard on each node counts for a walker of ``faction`` (None: 1 everywhere)."""
    factor = np.ones(len(flags))
    if faction is None:
        return factor
    factor[flags & ENEMY_TERRITORY[faction] > 0] = TERRITORY_FACTOR
    factor[flags & HOSTILE_TO[faction] > 0] = HOSTILE_FACTOR
    return factor
