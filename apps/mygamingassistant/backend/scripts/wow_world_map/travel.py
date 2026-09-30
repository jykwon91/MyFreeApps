"""Flight paths, boats, zeppelins and the tram — the travel graph for the directions.

All positions come from the Forever client tables (``TaxiNodes``,
``TaxiPath``, ``TaxiPathNode``); only the transport names / dock labels below
are hand-written, keyed by the client's transport path id. The generator
fails if a listed transport's stop count no longer matches its labels, so a
client change can't silently mislabel a dock.

The Deeprun Tram isn't a taxi path: its two stops are the entrance area
triggers into the tram instance, read from the Classic Era client (the
Forever client no longer ships area triggers — see ``dungeons.py``).
"""
from __future__ import annotations

import math
from collections import defaultdict

from scripts.wow_world_map import sources
from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.placement import place

TAXI_FLAG_ALLIANCE = 0x1
TAXI_FLAG_HORDE = 0x2
# Node names that are internal client entries, not flight masters.
_INTERNAL_PREFIXES = ("zzOLD", "Quest Path", "Transport", "Generic", "Programmer")

# Transport path id -> (label, vehicle, faction, dock label per stop in path order).
TRANSPORTS: dict[int, tuple[str, str, str, tuple[str, ...]]] = {
    302: ("Zeppelin: Orgrimmar - Undercity", "zeppelin", "H",
          ("Orgrimmar zeppelin tower", "Undercity zeppelin tower")),
    285: ("Zeppelin: Grom'gol - Orgrimmar", "zeppelin", "H",
          ("Grom'gol zeppelin tower", "Orgrimmar zeppelin tower")),
    301: ("Zeppelin: Grom'gol - Undercity", "zeppelin", "H",
          ("Grom'gol zeppelin tower", "Undercity zeppelin tower")),
    292: ("Boat: Menethil Harbor - Theramore", "boat", "A",
          ("Menethil Harbor dock", "Theramore dock")),
    295: ("Boat: Menethil Harbor - Auberdine", "boat", "A",
          ("Menethil Harbor dock", "Auberdine dock")),
    293: ("Boat: Rut'theran Village - Auberdine", "boat", "A",
          ("Rut'theran Village dock", "Auberdine dock")),
    303: ("Boat: Feathermoon Stronghold - Feralas coast", "boat", "A",
          ("Feathermoon Stronghold dock", "Feralas coast dock")),
    241: ("Boat: Ratchet - Booty Bay", "boat", "N",
          ("Ratchet dock", "Booty Bay dock")),
}

# Deeprun Tram: its entrance area triggers (Stormwind, Ironforge) -> stop label.
TRAM_ID = 369  # the tram instance's map id; doubles as the transport id
TRAM_ENTRANCES: dict[int, str] = {
    2173: "Deeprun Tram entrance, Stormwind",
    2175: "Deeprun Tram entrance, Ironforge",
}


def _node_faction(flags: int) -> str | None:
    alliance = bool(flags & TAXI_FLAG_ALLIANCE)
    horde = bool(flags & TAXI_FLAG_HORDE)
    if alliance and horde:
        return "N"
    if alliance:
        return "A"
    if horde:
        return "H"
    return None


def _place(
    zones: list[ZoneBounds],
    art: WorldMapArt,
    continent: int,
    wx: float,
    wy: float,
    zone_hint: str | None = None,
) -> list[object] | None:
    spot = place(zones, art, continent, wx, wy, zone_hint=zone_hint)
    return spot.as_row() if spot else None


def _zone_hint(node_name: str) -> str | None:
    """Flight paths are named "Place, Zone" ("Morgan's Vigil, Burning Steppes")."""
    _, sep, zone = node_name.rpartition(", ")
    return zone if sep else None


def _tram(zones: list[ZoneBounds], art: WorldMapArt) -> dict[str, object]:
    triggers = {
        int(r["ID"]): r
        for r in sources.wago_table(
            "AreaTrigger", branch=sources.WAGO_ERA_BRANCH, build=sources.WAGO_ERA_BUILD
        )
    }
    stops: list[list[object]] = []
    for trigger_id, label in TRAM_ENTRANCES.items():
        row = triggers.get(trigger_id)
        if row is None:
            raise ValueError(f"Deeprun Tram: area trigger {trigger_id} is gone from the client")
        continent = int(row["ContinentID"])
        wx, wy = float(row["Pos_0"]), float(row["Pos_1"])
        placed = _place(zones, art, continent, wx, wy)
        if placed is None:
            raise ValueError(f"Deeprun Tram: entrance {trigger_id} is outside every zone map")
        stops.append([label, continent, round(wx, 1), round(wy, 1), *placed])
    return {"id": TRAM_ID, "name": "Tram: Stormwind - Ironforge", "vehicle": "tram", "faction": "N", "stops": stops}


def build_travel(
    zones: list[ZoneBounds], art: WorldMapArt, continents: set[int]
) -> dict[str, object]:
    candidates: dict[int, list[object]] = {}
    for row in sources.wago_table("TaxiNodes"):
        name = row["Name_lang"]
        continent = int(row["ContinentID"])
        faction = _node_faction(int(row["Flags"]))
        if continent not in continents or faction is None or name.startswith(_INTERNAL_PREFIXES):
            continue
        wx, wy = float(row["Pos_0"]), float(row["Pos_1"])
        placed = _place(zones, art, continent, wx, wy, _zone_hint(name))
        if placed is None:
            continue
        candidates[int(row["ID"])] = [int(row["ID"]), name, continent, round(wx, 1), round(wy, 1), faction, *placed]

    edges: set[tuple[int, int]] = set()
    for row in sources.wago_table("TaxiPath"):
        a, b = int(row["FromTaxiNode"]), int(row["ToTaxiNode"])
        if a in candidates and b in candidates and a != b:
            edges.add((a, b))
    linked = {n for edge in edges for n in edge}
    nodes = [candidates[n] for n in sorted(linked)]

    stops_by_path: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in sources.wago_table("TaxiPathNode"):
        if int(row["PathID"]) in TRANSPORTS and int(row["Delay"]) > 0:
            stops_by_path[int(row["PathID"])].append(row)
    transports: list[dict[str, object]] = []
    for path_id, (label, vehicle, faction, docks) in sorted(TRANSPORTS.items()):
        stops: list[list[object]] = []
        seen: list[tuple[float, float]] = []
        for row in sorted(stops_by_path.get(path_id, []), key=lambda r: int(r["NodeIndex"])):
            continent = int(row["ContinentID"])
            wx, wy = float(row["Loc_0"]), float(row["Loc_1"])
            if any(math.hypot(wx - sx, wy - sy) < 50 for sx, sy in seen):
                continue  # a round-trip path revisits its first dock
            seen.append((wx, wy))
            placed = _place(zones, art, continent, wx, wy)
            if placed is None:
                raise ValueError(f"transport {path_id}: stop outside every zone map")
            stops.append([docks[len(stops)] if len(stops) < len(docks) else "?", continent, round(wx, 1), round(wy, 1), *placed])
        if len(stops) != len(docks):
            raise ValueError(f"transport {path_id} ({label}): {len(stops)} stops, {len(docks)} dock labels")
        transports.append({"id": path_id, "name": label, "vehicle": vehicle, "faction": faction, "stops": stops})
    transports.append(_tram(zones, art))

    return {
        "nodeColumns": ["id", "name", "continent", "worldX", "worldY", "faction", "zone", "subzone", "x", "y"],
        "nodes": nodes,
        "edges": sorted([list(e) for e in edges]),
        "stopColumns": ["label", "continent", "worldX", "worldY", "zone", "subzone", "x", "y"],
        "transports": transports,
    }
