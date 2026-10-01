"""Flight paths, boats, zeppelins and the tram — the travel graph for the directions.

All positions come from the Forever client tables (``TaxiNodes``,
``TaxiPath``, ``TaxiPathNode``); only the transport names / dock labels below
are hand-written, keyed by the client's transport path id. The generator
fails if a listed transport's stop count no longer matches its labels, so a
client change can't silently mislabel a dock.

Each flight route and boat / zeppelin loop also ships its in-game path
(``TaxiPathNode``), so the map draws the way you actually fly or sail, not a
straight line between the two ends. Flight paths are thinned to within
``PATH_TOLERANCE`` yards of the client's.

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

# Yards a thinned flight path may stray from the client's path.
PATH_TOLERANCE = 20.0

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


def _thin(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Douglas-Peucker: drop points within ``tolerance`` yards of the line they sit on."""
    if len(points) < 3:
        return points
    (ax, ay), (bx, by) = points[0], points[-1]
    length = math.hypot(bx - ax, by - ay)
    worst, far = -1.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if length == 0:
            d = math.hypot(px - ax, py - ay)
        else:
            d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
        if d > worst:
            worst, far = d, i
    if worst <= tolerance:
        return [points[0], points[-1]]
    return _thin(points[: far + 1], tolerance)[:-1] + _thin(points[far:], tolerance)


def _flat(points: list[tuple[float, float]]) -> list[int]:
    return [round(v) for point in points for v in point]


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

    path_rows: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in sources.wago_table("TaxiPathNode"):
        path_rows[int(row["PathID"])].append(row)
    for rows in path_rows.values():
        rows.sort(key=lambda r: int(r["NodeIndex"]))

    # (from, to) -> the client's path id; the lowest id wins when two share ends.
    edge_path: dict[tuple[int, int], int] = {}
    for row in sorted(sources.wago_table("TaxiPath"), key=lambda r: int(r["ID"])):
        a, b = int(row["FromTaxiNode"]), int(row["ToTaxiNode"])
        if a in candidates and b in candidates and a != b:
            edge_path.setdefault((a, b), int(row["ID"]))
    edges = sorted(edge_path)
    linked = {n for edge in edges for n in edge}
    nodes = [candidates[n] for n in sorted(linked)]
    edge_paths: list[list[int]] = []
    for edge in edges:
        rows = path_rows.get(edge_path[edge], [])
        continent = int(str(candidates[edge[0]][2]))
        points = [(float(r["Loc_0"]), float(r["Loc_1"])) for r in rows if int(r["ContinentID"]) == continent]
        edge_paths.append(_flat(_thin(points, PATH_TOLERANCE)))

    transports: list[dict[str, object]] = []
    for path_id, (label, vehicle, faction, docks) in sorted(TRANSPORTS.items()):
        stops: list[list[object]] = []
        stop_at: list[int] = []
        seen: list[tuple[float, float]] = []
        rows = path_rows.get(path_id, [])
        for index, row in enumerate(rows):
            if int(row["Delay"]) <= 0:
                continue
            continent = int(row["ContinentID"])
            wx, wy = float(row["Loc_0"]), float(row["Loc_1"])
            if any(math.hypot(wx - sx, wy - sy) < 50 for sx, sy in seen):
                continue  # a round-trip path revisits its first dock
            seen.append((wx, wy))
            stop_at.append(index)
            placed = _place(zones, art, continent, wx, wy)
            if placed is None:
                raise ValueError(f"transport {path_id}: stop outside every zone map")
            stops.append([docks[len(stops)] if len(stops) < len(docks) else "?", continent, round(wx, 1), round(wy, 1), *placed])
        if len(stops) != len(docks):
            raise ValueError(f"transport {path_id} ({label}): {len(stops)} stops, {len(docks)} dock labels")
        # The whole loop, so a trip either way follows the water it really takes.
        path = [[int(r["ContinentID"]), round(float(r["Loc_0"])), round(float(r["Loc_1"]))] for r in rows]
        transports.append({
            "id": path_id, "name": label, "vehicle": vehicle, "faction": faction, "stops": stops,
            "path": [v for point in path for v in point], "stopAt": stop_at,
        })
    transports.append(_tram(zones, art))

    return {
        "nodeColumns": ["id", "name", "continent", "worldX", "worldY", "faction", "zone", "subzone", "x", "y"],
        "nodes": nodes,
        "edges": [list(e) for e in edges],
        # Per edge: its flight path as flat x, y world yards.
        "edgePaths": edge_paths,
        "stopColumns": ["label", "continent", "worldX", "worldY", "zone", "subzone", "x", "y"],
        "transports": transports,
    }
