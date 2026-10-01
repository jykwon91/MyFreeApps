"""Ways between floors the navmesh can't see: lifts and same-map portals
(and, inside a dungeon, one-way teleports; one-way drops are ``drops.py``).

* **Lifts** (Undercity, Thunder Bluff, Freewind Post, ...) are server-side
  transport gameobjects — not in the client's map geometry. Their spawns
  (and so the shafts) come from cmangos classic-db (``gameobject`` of
  template type 11), their travel from the Forever client's
  ``TransportAnimation`` (the z offsets the car moves through). A lift joins
  the floor at the bottom of its travel to the floor at the top.
* **Portals** are area triggers that teleport within the same map (the
  Rut'theran Village <-> Darnassus portal, the Stormwind Wizard's Sanctum).
  Positions from the Classic Era client's ``AreaTrigger`` (the Forever client
  ships none), targets from cmangos ``areatrigger_teleport``. On a continent
  only pairs are used — each trigger's target lands on the other trigger.
  Inside a dungeon an unpaired one is a one-way teleport (Naxxramas' hub up
  to the Frostwyrm Lair). Links of the kinds in :data:`ONE_WAY` go a -> b only.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

import numpy as np

from scripts.wow_world_map import sources, sql_dump

GO_TYPE_TRANSPORT = 11
MIN_LIFT_TRAVEL = 10.0  # yd — smaller moves are doors and gears
MAX_LIFT_DRIFT = 1.0  # yd sideways — a lift moves straight up and down
SNAP_RADIUS = 10.0  # yd around a lift shaft / portal to its floor
SNAP_ABOVE = 4.0
SNAP_BELOW = 12.0  # a lift car rests up to ~10 yd above the floor you board it from (Thunder Bluff)
PAIR_RADIUS = 30.0  # a portal's target this close to the other trigger = a pair
PORTAL_COST_YARDS = 35.0  # loading screen and a few steps (~5 s)
EDGE_LIFT = 1
EDGE_PORTAL = 2
EDGE_DROP = 3  # one way: off a ledge down to the floor below
EDGE_TELEPORT = 4  # one way: an area trigger with no way back
ONE_WAY = frozenset({EDGE_DROP, EDGE_TELEPORT})


@dataclass(frozen=True)
class Link:
    a: tuple[float, float, float]
    b: tuple[float, float, float]
    cost: float  # yards at run speed
    kind: int


def _lift_links(map_id: int, tables: dict) -> list[Link]:
    templates = {r["entry"]: r for r in tables["gameobject_template"] if r["type"] == GO_TYPE_TRANSPORT}
    frames: dict[int, list[tuple[int, float, float, float]]] = defaultdict(list)
    for r in sources.wago_table("TransportAnimation"):
        frames[int(r["TransportID"])].append(
            (int(r["TimeIndex"]), float(r["Pos_0"]), float(r["Pos_1"]), float(r["Pos_2"])))
    links = []
    for go in tables["gameobject"]:
        if go["map"] != map_id or go["id"] not in templates or go["id"] not in frames:
            continue
        path = frames[go["id"]]
        zs = [p[3] for p in path]
        drift = max(math.hypot(p[1], p[2]) for p in path)
        travel = max(zs) - min(zs)
        if travel < MIN_LIFT_TRAVEL or drift > MAX_LIFT_DRIFT:
            continue
        x, y, z = go["position_x"], go["position_y"], go["position_z"]
        cycle = max(p[0] for p in path) / 1000.0  # ms -> s: an average wait plus the ride
        links.append(Link((x, y, z + min(zs)), (x, y, z + max(zs)), cycle * 7.0, EDGE_LIFT))
    return links


def _portal_links(map_id: int, tables: dict, one_way: bool) -> list[Link]:
    triggers = {
        int(r["ID"]): (float(r["Pos_0"]), float(r["Pos_1"]), float(r["Pos_2"]))
        for r in sources.wago_table("AreaTrigger", branch=sources.WAGO_ERA_BRANCH, build=sources.WAGO_ERA_BUILD)
        if int(r["ContinentID"]) == map_id
    }
    teleports = {
        r["id"]: (r["target_position_x"], r["target_position_y"], r["target_position_z"])
        for r in tables["areatrigger_teleport"]
        if r["target_map"] == map_id and r["id"] in triggers
    }
    links = []
    paired: set[int] = set()
    for a, target_a in teleports.items():
        for b, target_b in teleports.items():
            if a < b and math.dist(target_a[:2], triggers[b][:2]) < PAIR_RADIUS \
                    and math.dist(target_b[:2], triggers[a][:2]) < PAIR_RADIUS:
                links.append(Link(triggers[a], target_a, PORTAL_COST_YARDS, EDGE_PORTAL))
                links.append(Link(triggers[b], target_b, PORTAL_COST_YARDS, EDGE_PORTAL))
                paired |= {a, b}
    if one_way:
        links += [Link(triggers[a], target, PORTAL_COST_YARDS, EDGE_TELEPORT)
                  for a, target in sorted(teleports.items()) if a not in paired]
    return links


def map_links(map_id: int, instance: bool = False) -> list[Link]:
    tables = sql_dump.read_dump(
        sources.cmangos_dump(), {"gameobject", "gameobject_template", "areatrigger_teleport"})
    return _lift_links(map_id, tables) + _portal_links(map_id, tables, one_way=instance)


def snap_point(centroid: np.ndarray, reach: np.ndarray, point: tuple[float, float, float]) -> int | None:
    """The polygon a lift / portal end stands on: within :data:`SNAP_RADIUS` across,
    :data:`SNAP_ABOVE` over and :data:`SNAP_BELOW` under the point, on the ground
    with the largest ``reach`` (the area of the polygon's connected ground) —
    never the top of the lift's own housing next to it — then the nearest.
    """
    x, y, z = point
    dz = centroid[:, 2] - z
    near = np.nonzero((np.abs(centroid[:, 0] - x) <= SNAP_RADIUS) & (np.abs(centroid[:, 1] - y) <= SNAP_RADIUS)
                      & (dz <= SNAP_ABOVE) & (dz >= -SNAP_BELOW))[0]
    if not len(near):
        return None
    near = near[reach[near] == reach[near].max()]
    d = np.hypot(centroid[near, 0] - x, centroid[near, 1] - y) + np.abs(centroid[near, 2] - z)
    return int(near[np.argmin(d)])
