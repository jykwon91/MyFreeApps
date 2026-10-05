"""Write a map's walk graph for the page: ``public/wow-walk/<mapId>.walk``.

Besides the graph, the file carries the walk time between every pair of
travel hubs on the map (flight masters, boat / zeppelin docks, tram
entrances), so the page can plan a trip with real walking times without
searching the graph once per hub. Hubs are snapped to the graph by their 3D
client position (``TaxiNodes``, ``TaxiPathNode``, ``AreaTrigger``), which
keeps a zeppelin tower's top apart from the ground under it.

The file is gzipped (the page inflates it with ``DecompressionStream``);
inside, the layout is (little-endian)::

    "MGWK" u16 version, u16 mapId
    u32 nodes, u32 edges, u32 hubs, u32 json bytes
    nodes:  i16 x[n], i16 y[n], i16 z[n]      world yards (X north, Y west)
            u16 label[n]                      index into json "labels"
            u8  flags[n]                      1 = water (swim); 2 / 4 = near guards hostile
                                              to an Alliance / Horde walker; 8 / 16 = in
                                              the other faction's home zone (hostile.py)
    edges:  u32 a[m], u32 b[m], u16 cost[m]   cost in yards at run speed, off-road yards
                                              weighted (clusters.OFFROAD_FACTOR): picks the path
            u16 yards[m]                      yards at run speed actually walked: the time
            u8  kind[m]                       0 = walk / swim, 1 = lift, 2 = portal,
                                              3 = drop, 4 = teleport (3+ go a -> b only)
    hubs:   u32 node[h]
            u16 matrix[2][h*h]                hub-to-hub effort along the cheapest path for
                                              an Alliance, then a Horde walker: yards walked,
                                              a yard on dangerous ground counting
                                              hostile.danger_factor times; 65535 = no path
    json:   {"labels": [[name, zone, indoor, city]], "hubs": [key], "instance": 0 | 1}

Hub keys match ``travel.json``: ``t<taxi node id>`` and ``s<transport id>.<stop index>``.
A dungeon's file (``instance`` 1) has ``e<area trigger id>`` for its entrances
and ``b<encounter id>`` for its bosses (``classicInteriors.json``).
"""
from __future__ import annotations

import gzip
import heapq
import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from scripts.wow_world_map import sources
from scripts.wow_world_map.factions import ALLIANCE, HORDE
from scripts.wow_world_map.travel import TRAM_ENTRANCES, TRAM_ID
from scripts.wow_world_map.walk.clusters import Anchor, WalkGraph
from scripts.wow_world_map.walk.hostile import danger_factor
from scripts.wow_world_map.walk.links import ONE_WAY

MAGIC = b"MGWK"
VERSION = 3
FACTIONS = (ALLIANCE, HORDE)  # the hub matrices' order
UNREACHABLE = 0xFFFF


@dataclass(frozen=True)
class Hub:
    key: str
    x: float
    y: float
    z: float
    dock: bool = False  # a boat / zeppelin stop: the position is the vehicle's
    keeps: bool = True  # see clusters.Anchor

    @property
    def anchor(self) -> Anchor:
        return Anchor(self.x, self.y, self.z, self.dock, self.keeps)


def _nearest(rows: list[dict[str, str]], x: float, y: float, prefix: str) -> float:
    best = min(rows, key=lambda r: math.hypot(float(r[f"{prefix}_0"]) - x, float(r[f"{prefix}_1"]) - y))
    return float(best[f"{prefix}_2"])


def travel_hubs(travel: dict, map_id: int) -> list[Hub]:
    """The map's flight masters, docks and tram entrances, with client heights."""
    taxi = {int(r["ID"]): r for r in sources.wago_table("TaxiNodes")}
    path_nodes: dict[int, list[dict[str, str]]] = {}
    for r in sources.wago_table("TaxiPathNode"):
        if int(r["Delay"]) > 0:
            path_nodes.setdefault(int(r["PathID"]), []).append(r)
    triggers = [
        r for r in sources.wago_table("AreaTrigger", branch=sources.WAGO_ERA_BRANCH, build=sources.WAGO_ERA_BUILD)
        if int(r["ID"]) in TRAM_ENTRANCES
    ]
    cols = travel["nodeColumns"]
    hubs = []
    for node in travel["nodes"]:
        row = dict(zip(cols, node))
        if row["continent"] == map_id:
            t = taxi[row["id"]]
            hubs.append(Hub(f"t{row['id']}", float(t["Pos_0"]), float(t["Pos_1"]), float(t["Pos_2"])))
    stop_cols = travel["stopColumns"]
    for transport in travel["transports"]:
        for i, stop in enumerate(transport["stops"]):
            s = dict(zip(stop_cols, stop))
            if s["continent"] != map_id:
                continue
            rows = triggers if transport["id"] == TRAM_ID else path_nodes[transport["id"]]
            prefix = "Pos" if transport["id"] == TRAM_ID else "Loc"
            z = _nearest(rows, s["worldX"], s["worldY"], prefix)
            hubs.append(Hub(f"s{transport['id']}.{i}", s["worldX"], s["worldY"], z, transport["id"] != TRAM_ID))
    return hubs


def _yards(graph: WalkGraph) -> np.ndarray:
    return graph.cost if graph.yards is None else graph.yards


def edge_danger(graph: WalkGraph, faction: str | None) -> np.ndarray:
    """(m,) what a yard of each edge counts for a walker of ``faction``: its more dangerous end's."""
    if graph.hostile is None:
        return np.ones(len(graph.edges))
    node = danger_factor(graph.hostile, faction)
    return np.maximum(node[graph.edges[:, 0]], node[graph.edges[:, 1]])


def _adjacency(graph: WalkGraph, faction: str | None) -> list[list[tuple[int, float, float]]]:
    """Each node's (neighbour, cost, effort) for a walker of ``faction``: the cost picks
    the path; the effort (yards walked, danger-weighted) is what the hub matrix holds."""
    adj: list[list[tuple[int, float, float]]] = [[] for _ in range(len(graph.position))]
    danger = edge_danger(graph, faction)
    edges = zip(graph.edges.tolist(), (graph.cost * danger).tolist(), (_yards(graph) * danger).tolist(),
                graph.kind.tolist())
    for (a, b), c, y, kind in edges:
        adj[a].append((b, c, y))
        if kind not in ONE_WAY:
            adj[b].append((a, c, y))
    return adj


def _dijkstra(adj: list[list[tuple[int, float, float]]], src: int, targets: set[int]) -> dict[int, float]:
    """The effort along the cheapest path from ``src`` to each reachable target."""
    dist = {src: 0.0}
    effort = {src: 0.0}
    found: dict[int, float] = {}
    heap = [(0.0, src)]
    while heap and len(found) < len(targets):
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        if u in targets:
            found[u] = effort[u]
        for v, c, y in adj[u]:
            nd = d + c
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                effort[v] = effort[u] + y
                heapq.heappush(heap, (nd, v))
    return found


def hub_matrix(graph: WalkGraph, hubs: list[Hub], faction: str | None = None) -> tuple[list[Hub], list[int], np.ndarray]:
    """The hubs on the graph, their nodes, and the effort between every pair for a
    walker of ``faction`` (None: no ground is dangerous, the effort is the yards walked).

    ``hubs`` must be the anchors :func:`clusters.cluster` was given, in order.
    """
    snapped = list(zip(hubs, graph.anchor_node, strict=True))
    for h, node in snapped:
        if node is None:
            print(f"  hub {h.key} is off the walk graph — walking to it stays a straight line")
    kept = [(h, n) for h, n in snapped if n is not None]
    nodes = [n for _, n in kept]
    adj = _adjacency(graph, faction)
    matrix = np.full((len(kept), len(kept)), UNREACHABLE, dtype=np.uint16)
    targets = set(nodes)
    for i, src in enumerate(nodes):
        dist = _dijkstra(adj, src, targets)
        for j, dst in enumerate(nodes):
            if dst in dist:
                matrix[i, j] = min(UNREACHABLE - 1, round(dist[dst]))
    return [h for h, _ in kept], nodes, matrix


def interior_hubs(interior: dict[str, list]) -> list[Hub]:
    """A dungeon's entrances (``e<trigger>``), then its placed bosses (``b<encounter>``)."""
    hubs = [Hub(f"e{t}", x, y, z) for t, x, y, z in interior["entrances"]]
    hubs += [Hub(f"b{e}", x, y, z, keeps=False) for e, _, x, y, z, _ in interior["bosses"] if x is not None]
    return hubs


def write_walk(path: Path, map_id: int, graph: WalkGraph, hubs: list[Hub], hub_nodes: list[int],
               matrices: list[np.ndarray], instance: bool = False) -> int:
    """``matrices``: :func:`hub_matrix` for each of ``FACTIONS``, in order."""
    fields: dict = {
        "labels": [[lab.name, lab.zone, int(lab.indoor), int(lab.city)] for lab in graph.labels],
        "hubs": [h.key for h in hubs],
    }
    if instance:
        fields["instance"] = 1
    assert len(matrices) == len(FACTIONS)
    flags = graph.water.astype(np.uint8)
    if graph.hostile is not None:
        flags |= graph.hostile
    meta = json.dumps(fields, ensure_ascii=False, separators=(",", ":")).encode()
    pos = np.round(graph.position).astype(np.int16)
    parts = [
        MAGIC, struct.pack("<2H4I", VERSION, map_id, len(pos), len(graph.edges), len(hubs), len(meta)),
        pos[:, 0].tobytes(), pos[:, 1].tobytes(), pos[:, 2].tobytes(),
        graph.label.astype("<u2").tobytes(), flags.tobytes(),
        graph.edges[:, 0].astype("<u4").tobytes(), graph.edges[:, 1].astype("<u4").tobytes(),
        np.minimum(np.round(graph.cost), UNREACHABLE - 1).astype("<u2").tobytes(),
        np.minimum(np.round(_yards(graph)), UNREACHABLE - 1).astype("<u2").tobytes(),
        graph.kind.astype(np.uint8).tobytes(),
        np.array(hub_nodes, dtype="<u4").tobytes(), *(m.astype("<u2").tobytes() for m in matrices),
        meta,
    ]
    data = gzip.compress(b"".join(parts), compresslevel=9, mtime=0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return len(data)
