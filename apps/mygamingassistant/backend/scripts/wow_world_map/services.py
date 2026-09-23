"""Service NPCs (trainers, flight masters, inns, banks, ...) from cmangos classic-db.

Output rows are GPL-3.0 (derived from cmangos) — written only to the
``classic/`` data folder that carries its own LICENSE.
"""
from __future__ import annotations

import math
from collections import Counter

from scripts.wow_world_map import sources
from scripts.wow_world_map.classify import classify
from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.factions import FactionTemplate, usable_by
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.placement import place
from scripts.wow_world_map.sql_dump import read_dump
from scripts.wow_world_map.zones import FOREVER_ONLY_ZONES

CLASSIC_CONTINENTS = (0, 1)  # cmangos 1.12 has no Forever-only maps

# Two spawns of the same NPC closer than this are one map marker.
SAME_SPOT_YARDS = 40.0

COLUMNS = ["guid", "npcId", "subkind", "tag", "name", "title", "zone", "subzone", "x", "y", "faction"]


def build_services(
    zones: list[ZoneBounds], art: WorldMapArt
) -> tuple[list[list[object]], Counter[str]]:
    tables = read_dump(
        sources.cmangos_dump(), {"creature", "creature_template", "game_event_creature"}
    )
    reactions = {
        int(r["ID"]): FactionTemplate.from_csv_row(r)
        for r in sources.wago_table("FactionTemplate")
    }
    npc_templates = {int(str(r["Entry"])): r for r in tables["creature_template"]}
    # Seasonal / world-event spawns (positive event id) aren't there most days.
    event_only = {
        int(str(r["guid"])) for r in tables["game_event_creature"] if int(str(r["event"])) > 0
    }

    rows: list[list[object]] = []
    counts: Counter[str] = Counter()
    placed: dict[int, list[tuple[float, float]]] = {}
    for spawn in sorted(tables["creature"], key=lambda r: int(str(r["guid"]))):
        guid = int(str(spawn["guid"]))
        continent = int(str(spawn["map"]))
        if continent not in CLASSIC_CONTINENTS or guid in event_only:
            continue
        npc_id = int(str(spawn["id"]))
        template = npc_templates.get(npc_id)
        if template is None:
            continue
        kind = classify(template)
        if kind is None:
            continue
        faction = usable_by(int(str(template["Faction"])), reactions)
        if faction is None:
            continue
        wx, wy = float(str(spawn["position_x"])), float(str(spawn["position_y"]))
        if any(math.hypot(wx - px, wy - py) < SAME_SPOT_YARDS for px, py in placed.get(npc_id, [])):
            continue
        # A Classic spawn is never on a Forever-only zone's map: those zones
        # overlap Classic rectangles but hold none of the 1.12 NPCs.
        spot = place(zones, art, continent, wx, wy, exclude=FOREVER_ONLY_ZONES)
        if spot is None:
            continue
        placed.setdefault(npc_id, []).append((wx, wy))
        subkind, tag = kind
        rows.append([
            guid,
            npc_id,
            subkind,
            tag,
            str(template["Name"]),
            str(template["SubName"] or ""),
            *spot.as_row(),
            faction,
        ])
        counts[f"{subkind}:{tag}" if tag else subkind] += 1
    rows.sort(key=lambda r: (str(r[2]), str(r[3]), str(r[4]), int(str(r[0]))))
    return rows, counts
