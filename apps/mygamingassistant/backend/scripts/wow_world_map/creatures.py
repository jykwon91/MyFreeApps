"""Every spawned creature and NPC the World Map's search can name, from cmangos classic-db.

``classicServices.json`` and ``classicQuests.json`` only know trainers, vendors, flight masters
and quest givers, so "Lady Katrana Prestor" or any ordinary creature never matched a search. This
is the rest: every named creature with a Classic continent spawn that those two files don't carry.

One row per (name, title): the same name is one search result however many creature entries share
it. Spawns are placed on zone maps like the services' are, then thinned — a creature keeps at most
``MAX_SPOTS_PER_ZONE`` spots per zone, spread across the zone, so a pack mob with 400 spawns costs
a few bytes, not 400 rows.

Output rows are GPL-3.0 (derived from cmangos) — written only to the ``classic/`` data folder that
carries its own LICENSE.
"""
from __future__ import annotations

import math
import re
from collections import defaultdict
from collections.abc import Mapping, Sequence

from scripts.wow_world_map import sources
from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.factions import NEUTRAL, FactionTemplate, usable_by
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.placement import place
from scripts.wow_world_map.sql_dump import read_dump
from scripts.wow_world_map.zones import FOREVER_ONLY_ZONES

CLASSIC_CONTINENTS = (0, 1)  # cmangos 1.12 has no Forever-only maps

# Two spawns of the same creature closer than this are one spot.
SAME_SPOT_YARDS = 40.0
# The most spots one creature keeps on one continent before they are placed on zone maps.
MAX_WORLD_SPOTS = 48
# The most spots one creature keeps on one zone map.
MAX_SPOTS_PER_ZONE = 6

COLUMNS = ["npcId", "name", "title", "levelMin", "levelMax", "side", "spots"]
# `spots` is flat: zone map id, index into the file's `subzones`, x, y — four numbers a spot.
SPOT_WIDTH = 4

# Test, placeholder and invisible-helper entries the game never shows a player.
_HIDDEN_NAME = re.compile(r"^\[|\b(dnd|unused|test|trigger|invisible|visual|bunny)\b|^\s*$", re.IGNORECASE)

# (zone id, subzone, x, y) of one placed spawn, with the world position it came from.
Spawn = tuple[int, str, float, float, float, float]


def shown_name(name: str) -> bool:
    return not _HIDDEN_NAME.search(name)


def spread(points: Sequence[tuple[float, float]], keep: int) -> list[int]:
    """Indexes of ``keep`` of the points that are as far apart as can be (farthest-point sampling).

    Starts from the first point, so the result is the same on every run; returned in input order.
    """
    if len(points) <= keep:
        return list(range(len(points)))
    chosen = [0]
    nearest = [math.dist(points[0], p) for p in points]
    while len(chosen) < keep:
        farthest = max(range(len(points)), key=lambda i: (nearest[i], -i))
        chosen.append(farthest)
        nearest = [min(d, math.dist(points[farthest], p)) for d, p in zip(nearest, points)]
    return sorted(chosen)


def separate(points: list[tuple[float, float]]) -> list[int]:
    """Indexes of the points that are not within ``SAME_SPOT_YARDS`` of an earlier kept one."""
    kept: list[int] = []
    for i, (x, y) in enumerate(points):
        if all(math.hypot(x - points[k][0], y - points[k][1]) >= SAME_SPOT_YARDS for k in kept):
            kept.append(i)
    return kept


def known_npc_ids(services: Mapping[str, object], quests: Mapping[str, object]) -> set[int]:
    """Creature entries the services and quest-giver files already place."""
    ids = {int(str(row[1])) for row in services["rows"]}  # type: ignore[attr-defined]
    entry = list(quests["giverColumns"]).index("entry")  # type: ignore[call-overload]
    kind = list(quests["giverColumns"]).index("type")  # type: ignore[call-overload]
    ids |= {int(str(row[entry])) for row in quests["givers"] if row[kind] == "npc"}  # type: ignore[attr-defined]
    return ids


def build_creatures(
    zones: list[ZoneBounds],
    art: WorldMapArt,
    services: Mapping[str, object],
    quests: Mapping[str, object],
) -> tuple[list[str], list[list[object]]]:
    """``(subzones, rows)`` for ``classicCreatures.json``."""
    tables = read_dump(sources.cmangos_dump(), {"creature", "creature_template", "game_event_creature"})
    reactions = {int(r["ID"]): FactionTemplate.from_csv_row(r) for r in sources.wago_table("FactionTemplate")}
    templates = {int(str(r["Entry"])): r for r in tables["creature_template"]}
    event_only = {int(str(r["guid"])) for r in tables["game_event_creature"] if int(str(r["event"])) > 0}
    placed_elsewhere = known_npc_ids(services, quests)

    # (name, title) -> continent -> [(world x, world y)], plus who and how strong the entries are.
    world: dict[tuple[str, str], dict[int, list[tuple[float, float]]]] = defaultdict(lambda: defaultdict(list))
    entries: dict[tuple[str, str], list[int]] = defaultdict(list)
    for spawn in sorted(tables["creature"], key=lambda r: int(str(r["guid"]))):
        continent = int(str(spawn["map"]))
        npc_id = int(str(spawn["id"]))
        template = templates.get(npc_id)
        if template is None or continent not in CLASSIC_CONTINENTS or npc_id in placed_elsewhere:
            continue
        if int(str(spawn["guid"])) in event_only:
            continue
        name = str(template["Name"]).strip()
        if not shown_name(name):
            continue
        key = (name, str(template["SubName"] or "").strip())
        world[key][continent].append((float(str(spawn["position_x"])), float(str(spawn["position_y"]))))
        if npc_id not in entries[key]:
            entries[key].append(npc_id)

    subzones: list[str] = [""]
    subzone_index = {"": 0}
    rows: list[list[object]] = []
    for (name, title), by_continent in sorted(world.items()):
        ids = sorted(entries[(name, title)])
        spots: list[Spawn] = []
        for continent, points in sorted(by_continent.items()):
            points = [points[i] for i in separate(points)]
            points = [points[i] for i in spread(points, MAX_WORLD_SPOTS)]
            for wx, wy in points:
                # A Classic spawn is never on a Forever-only zone's map.
                spot = place(zones, art, continent, wx, wy, exclude=FOREVER_ONLY_ZONES)
                if spot is not None:
                    spots.append((spot.zone.ui_map_id, spot.subzone, round(spot.x, 1), round(spot.y, 1), wx, wy))
        if not spots:
            continue
        flat: list[object] = []
        by_zone: dict[int, list[Spawn]] = defaultdict(list)
        for s in spots:
            by_zone[s[0]].append(s)
        for zone_id in sorted(by_zone):
            kept = by_zone[zone_id]
            kept = [kept[i] for i in spread([(s[2], s[3]) for s in kept], MAX_SPOTS_PER_ZONE)]
            for zone, subzone, x, y, _wx, _wy in kept:
                if subzone not in subzone_index:
                    subzone_index[subzone] = len(subzones)
                    subzones.append(subzone)
                flat += [zone, subzone_index[subzone], x, y]
        levels = [int(str(templates[i][c])) for i in ids for c in ("MinLevel", "MaxLevel")]
        sides = {usable_by(int(str(templates[i]["Faction"])), reactions) or NEUTRAL for i in ids}
        side = sides.pop() if len(sides) == 1 else NEUTRAL
        rows.append([ids[0], name, title, min(levels), max(levels), side, flat])
    return subzones, rows
