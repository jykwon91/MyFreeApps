"""Group the navmesh polygons into the page's walk graph nodes.

Neighbouring polygons with the same label (room / sub-area) and medium
(ground or water), on or off the road alike, are grouped around a seed, at most :data:`OUTDOOR_RADIUS`
yards out (:data:`INDOOR_RADIUS` indoors and in capital cities, where the
directions turn by turn). A cluster edge costs the travel
time between the two clusters' centre polygons over the polygon graph, in
"ground yards" (yards at run speed), off-road yards weighted by
:data:`OFFROAD_FACTOR` so routes keep to the roads; each edge also carries
the ground yards actually walked, unweighted, for walking times. Lifts and portals add their own edges,
and in a dungeon so do one-way teleports and drops (``drops.py``) — edges of
the kinds in ``links.ONE_WAY`` go a -> b only.

Only the parts of the navmesh a player can reach are kept: those joined (on
foot, by lift or portal) to a travel hub, or — on a map without hubs — every
part bigger than :data:`MIN_COMPONENT_AREA`. Rooftops, the tops of invisible
walls and sealed rooms are dropped.
"""
from __future__ import annotations

import heapq
import math
from collections import defaultdict
from dataclasses import dataclass

import numpy as np

from scripts.wow_world_map.walk.drops import find_drops
from scripts.wow_world_map.walk.links import EDGE_LIFT, EDGE_TELEPORT, Link, snap_point
from scripts.wow_world_map.walk.walk_graph import Label, PolyGraph

RUN_SPEED = 7.0
SWIM_SPEED = 4.72
SWIM_FACTOR = RUN_SPEED / SWIM_SPEED
# Off the road (on land or in water), a yard costs this many: directions keep
# to the roads a player would follow (``roads.py``) unless leaving them saves real time.
OFFROAD_FACTOR = 1.4
OUTDOOR_RADIUS = 32.0
INDOOR_RADIUS = 12.0
CLUSTER_MAX_DZ = 6.0
MIN_COMPONENT_AREA = 600.0  # yd²
EDGE_WALK = 0
SNAP_VERTICAL_WEIGHT = 2.0  # a yard of height counts as two when snapping a point
SNAP_WATER_PENALTY = 15.0  # prefer the dock to the sea next to it
MAX_SNAP = 60.0
DOCK_RADIUS = 40.0  # yd from a boat / zeppelin to the pier / tower top it stops at
DOCK_HEADROOM = 12.0  # a pier stands up to ~10 yd above the sea a boat sits on


@dataclass
class WalkGraph:
    position: np.ndarray  # (n, 3) world, the cluster's centre polygon
    label: np.ndarray  # (n,) index into labels
    water: np.ndarray  # (n,) bool
    edges: np.ndarray  # (m, 2) node pairs
    cost: np.ndarray  # (m,) ground yards
    kind: np.ndarray  # (m,) EDGE_WALK / links.EDGE_* (a one-way kind goes a -> b)
    labels: list[Label]
    # The node each anchor (travel hub) stands on, snapped against the polygons
    # before clustering — a cluster's centre can be well off the pier it covers.
    anchor_node: list[int | None]
    # (m,) ground yards actually walked along each edge: ``cost`` without the
    # road preference, for walking *times*. None: the same as ``cost``.
    yards: np.ndarray | None = None
    # (n,) u8 hostile.HOSTILE_TO / ENEMY_TERRITORY bits: the other faction's towns
    # and home zones. None: none.
    hostile: np.ndarray | None = None


def _snap_score(position: np.ndarray, water: np.ndarray, x: float, y: float, z: float) -> np.ndarray:
    return (np.hypot(position[:, 0] - x, position[:, 1] - y) + SNAP_VERTICAL_WEIGHT * np.abs(position[:, 2] - z)
            + SNAP_WATER_PENALTY * water)


@dataclass(frozen=True)
class Anchor:
    """A travel hub's client position. A dock's is the boat / zeppelin itself, not the ground."""
    x: float
    y: float
    z: float
    dock: bool = False
    # Whether the ground it stands on is kept. A boss isn't somewhere you
    # arrive from, so its ground is kept only when an entrance reaches it.
    keeps: bool = True


def snap_hub(position: np.ndarray, water: np.ndarray, comp: np.ndarray, comp_size: np.ndarray,
             hub: Anchor) -> int | None:
    """The polygon a travel hub stands on (None: nowhere near).

    Only the largest connected ground in reach counts: a hub is somewhere
    players walk to, never a sealed-off piece next to it (the Deeprun Tram
    hall past its entrance trigger). A dock stands on the highest ground
    within :data:`DOCK_RADIUS` of its vehicle and not above it — the pier,
    or the top of the zeppelin tower rather than the ground under it.
    """
    if hub.dock:
        reach = np.hypot(position[:, 0] - hub.x, position[:, 1] - hub.y)
        near = np.nonzero((reach <= DOCK_RADIUS) & (position[:, 2] <= hub.z + DOCK_HEADROOM) & ~water.astype(bool))[0]
    else:
        score = _snap_score(position, water, hub.x, hub.y, hub.z)
        near = np.nonzero(score <= MAX_SNAP)[0]
    if not len(near):
        return None
    main = comp[near[np.argmax(comp_size[comp[near]])]]
    near = near[comp[near] == main]
    if hub.dock:
        reach = np.hypot(position[near, 0] - hub.x, position[near, 1] - hub.y)
        return int(near[np.lexsort((reach, -position[near, 2]))[0]])
    return int(near[np.argmin(score[near])])


def snap_inside(position: np.ndarray, water: np.ndarray, comp: np.ndarray, comp_area: np.ndarray,
                anchors: list[Anchor]) -> list[int | None]:
    """Snap a dungeon's anchors: each to the nearest floor — never "the
    largest ground in reach", which outside the castle is the zone's terrain
    under it — though an entrance skips a speck smaller than
    :data:`MIN_COMPONENT_AREA` for real ground in reach. Entrances first; a boss then prefers floor an entrance reaches,
    so it isn't put on the ledge above or the cellar below its room."""
    score = [_snap_score(position, water, a.x, a.y, a.z) for a in anchors]
    snapped: list[int | None] = [None] * len(anchors)
    big = comp_area[comp] >= MIN_COMPONENT_AREA
    for i, a in enumerate(anchors):
        near = score[i] <= MAX_SNAP
        if a.keeps and near.any():
            # Not a speck of floor by the trigger when real ground is in reach (Naxxramas).
            pick = near & big if (near & big).any() else near
            snapped[i] = int(np.argmin(np.where(pick, score[i], np.inf)))
    reached = np.isin(comp, [comp[p] for p in snapped if p is not None])
    for i, a in enumerate(anchors):
        if a.keeps:
            continue
        near = score[i] <= MAX_SNAP
        pick = near & reached if (near & reached).any() else near
        if pick.any():
            snapped[i] = int(np.argmin(np.where(pick, score[i], np.inf)))
    return snapped


def components(indptr: list[int], indices: list[int], n: int, extra: dict[int, list[int]]) -> list[int]:
    comp = [-1] * n
    k = 0
    for start in range(n):
        if comp[start] >= 0:
            continue
        comp[start] = k
        stack = [start]
        while stack:
            u = stack.pop()
            for v in indices[indptr[u]:indptr[u + 1]] + extra.get(u, []):
                if comp[v] < 0:
                    comp[v] = k
                    stack.append(v)
        k += 1
    return comp


class _StepCost:
    """Ground-yard cost between two adjacent polygons' centres."""

    def __init__(self, cx: list[float], cy: list[float], cz: list[float], water: list[bool],
                 road: list[bool] | None) -> None:
        self.cx, self.cy, self.cz, self.water, self.road = cx, cy, cz, water, road

    def _factor(self, p: int, prefer_road: bool) -> float:
        # Water is off the road too: without the road weighting on top, a long
        # swim would look nearly as cheap as walking the land beside it.
        offroad = OFFROAD_FACTOR if prefer_road and self.road is not None and not self.road[p] else 1.0
        return offroad * SWIM_FACTOR if self.water[p] else offroad

    def distance(self, a: int, b: int) -> float:
        return math.sqrt((self.cx[a] - self.cx[b]) ** 2 + (self.cy[a] - self.cy[b]) ** 2
                         + (self.cz[a] - self.cz[b]) ** 2)

    def __call__(self, a: int, b: int) -> float:
        return self.distance(a, b) * (self._factor(a, True) + self._factor(b, True)) / 2

    def yards(self, a: int, b: int) -> float:
        """The ground yards walked: the cost without the road preference."""
        return self.distance(a, b) * (self._factor(a, False) + self._factor(b, False)) / 2


def _local_cost(indptr: list[int], indices: list[int], owner: list[int], step: _StepCost,
                src: int, dst: int, ca: int, cb: int) -> tuple[float, float] | None:
    """Cheapest polygon path src -> dst that stays inside clusters ca and cb: its cost
    and the ground yards walked along it."""
    dist = {src: 0.0}
    walked = {src: 0.0}
    heap = [(0.0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == dst:
            return d, walked[u]
        if d > dist[u]:
            continue
        for i in range(indptr[u], indptr[u + 1]):
            v = indices[i]
            if owner[v] != ca and owner[v] != cb:
                continue
            nd = d + step(u, v)
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                walked[v] = walked[u] + step.yards(u, v)
                heapq.heappush(heap, (nd, v))
    return None


def _snap_links(polys: PolyGraph, indptr: list[int], indices: list[int],
                links: list[Link]) -> list[tuple[int, int, float, int]]:
    ground = np.array(components(indptr, indices, len(polys), {}))
    reach = np.bincount(ground, weights=polys.area)[ground]
    out = []
    for link in links:
        a, b = snap_point(polys.centroid, reach, link.a), snap_point(polys.centroid, reach, link.b)
        if a is None or b is None or a == b:
            what = {EDGE_LIFT: "lift", EDGE_TELEPORT: "teleport"}.get(link.kind, "portal")
            print(f"  {what} at ({link.a[0]:.0f}, {link.a[1]:.0f}) has no floor at one end — skipped")
            continue
        out.append((a, b, link.cost, link.kind))
    return out


def _components(polys: PolyGraph, indptr: list[int], indices: list[int],
                special: list[tuple[int, int, float, int]]) -> tuple[np.ndarray, np.ndarray]:
    """Connected pieces of floor (a one-way link joins both ends: it decides what's
    kept, not the route) and each piece's area."""
    extra: dict[int, list[int]] = defaultdict(list)
    for a, b, _, _ in special:
        extra[a].append(b)
        extra[b].append(a)
    comp = np.array(components(indptr, indices, len(polys), extra))
    return comp, np.bincount(comp, weights=polys.area)


def _grow(seed: int, radius2: float, indptr: list[int], indices: list[int], owner: list[int], k: int,
          cx: list[float], cy: list[float], cz: list[float], lab: list[int], water: list[bool],
          road: list[bool]) -> list[int]:
    sx, sy, sz, sl, sw, sr = cx[seed], cy[seed], cz[seed], lab[seed], water[seed], road[seed]
    owner[seed] = k
    group = [seed]
    stack = [seed]
    while stack:
        u = stack.pop()
        for i in range(indptr[u], indptr[u + 1]):
            v = indices[i]
            if (owner[v] < 0 and lab[v] == sl and water[v] == sw and road[v] == sr and abs(cz[v] - sz) <= CLUSTER_MAX_DZ
                    and (cx[v] - sx) ** 2 + (cy[v] - sy) ** 2 <= radius2):
                owner[v] = k
                group.append(v)
                stack.append(v)
    return group


def cluster(polys: PolyGraph, poly_label: np.ndarray, labels: list[Label], links: list[Link],
            anchors: list[Anchor], fine: bool = False, road: np.ndarray | None = None) -> WalkGraph:
    """``fine``: small clusters everywhere (a dungeon, told turn by turn throughout).
    ``road``: each polygon on a road (``roads.py``); None: no roads (a dungeon)."""
    n = len(polys)
    indptr, indices = polys.indptr.tolist(), polys.indices.tolist()
    cx, cy, cz = (polys.centroid[:, k].tolist() for k in range(3))
    water = polys.water.tolist()
    lab = poly_label.tolist()
    on_road = road.tolist() if road is not None else None
    special = _snap_links(polys, indptr, indices, links)
    comp, comp_area = _components(polys, indptr, indices, special)
    if fine:
        snapped = snap_inside(polys.centroid, polys.water, comp, comp_area, anchors)
        if polys.ledge is not None:
            reached = {int(comp[p]) for p, a in zip(snapped, anchors) if p is not None and a.keeps}
            wanted = {int(comp[p]) for p, a in zip(snapped, anchors) if p is not None and not a.keeps}
            drops = find_drops(polys, comp, comp_area, reached, wanted, MIN_COMPONENT_AREA)
            if drops:
                special += drops
                comp, comp_area = _components(polys, indptr, indices, special)
                snapped = snap_inside(polys.centroid, polys.water, comp, comp_area, anchors)
    else:
        snapped = [snap_hub(polys.centroid, polys.water, comp, comp_area, a) for a in anchors]
    anchored = {int(comp[p]) for p, a in zip(snapped, anchors) if p is not None and a.keeps}
    keep = comp_area[comp] >= MIN_COMPONENT_AREA
    if anchored:
        keep &= np.isin(comp, list(anchored))
    keep_list = keep.tolist()

    owner = [-1] * n
    members: list[list[int]] = []
    for seed in range(n):
        if owner[seed] < 0 and keep_list[seed]:
            label = labels[lab[seed]]
            radius = INDOOR_RADIUS if fine or label.indoor or label.city else OUTDOOR_RADIUS
            members.append(_grow(seed, radius * radius, indptr, indices, owner, len(members),
                                 cx, cy, cz, lab, water, on_road if on_road is not None else [False] * n))
    reps = []
    for group in members:
        g = np.array(group)
        centre = np.average(polys.centroid[g], axis=0, weights=np.maximum(polys.area[g], 0.01))
        reps.append(int(g[np.argmin(np.linalg.norm(polys.centroid[g] - centre, axis=1))]))

    pairs = set()
    for u in range(n):
        ou = owner[u]
        if ou < 0:
            continue
        for i in range(indptr[u], indptr[u + 1]):
            ov = owner[indices[i]]
            if ov >= 0 and ov != ou:
                pairs.add((ou, ov) if ou < ov else (ov, ou))
    step = _StepCost(cx, cy, cz, water, on_road)
    edges, costs, walked, kinds = [], [], [], []
    for a, b in sorted(pairs):
        found = _local_cost(indptr, indices, owner, step, reps[a], reps[b], a, b)
        if found is not None:
            edges.append((a, b))
            costs.append(found[0])
            walked.append(found[1])
            kinds.append(EDGE_WALK)
    for pa, pb, cost, kind in special:
        if owner[pa] >= 0 and owner[pb] >= 0:
            edges.append((owner[pa], owner[pb]))
            costs.append(cost + step.distance(reps[owner[pa]], pa) + step.distance(reps[owner[pb]], pb))
            walked.append(costs[-1])
            kinds.append(kind)
    anchor_node = [None if p is None or owner[p] < 0 else owner[p] for p in snapped]
    rep = np.array(reps, dtype=np.int64)
    print(f"  clusters: {len(members)}, edges: {len(edges)} ({len(special)} lifts / portals / drops), "
          f"kept {keep.mean():.0%} of polygons")
    return WalkGraph(polys.centroid[rep], poly_label[rep], polys.water[rep],
                     np.array(edges, dtype=np.int64).reshape(-1, 2), np.array(costs),
                     np.array(kinds, dtype=np.uint8), labels, anchor_node, np.array(walked))
