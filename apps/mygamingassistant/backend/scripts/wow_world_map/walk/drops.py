"""One-way drops inside a dungeon: where you step off a ledge onto a floor below.

A navmesh joins floors you can walk between; a drop you can't climb back up
(Wailing Caverns' gap before Lord Serpentis, the pipe from Grobbulus down to
Gluth in Naxxramas) leaves the lower floor a separate piece. A drop is only
added on the way to a boss's floor that nothing else reaches — never as a
shortcut between floors already joined, never into floor no boss is on — so
each one rescues a boss that would otherwise have no route at all:

* it starts on an open edge (a polygon side with no floor past it) of floor
  already reached, and lands on a corner of the lower piece past that edge;
* the landing is :data:`MIN_DROP` to :data:`MAX_DROP` yd below (more than a
  step, less than a fall that kills) and at most :data:`MAX_ACROSS` yd out;
* pieces are reached outward from the entrances, the closest drop first.
"""
from __future__ import annotations

import heapq
from collections import defaultdict

import numpy as np

from scripts.wow_world_map.walk.links import EDGE_DROP
from scripts.wow_world_map.walk.walk_graph import PolyGraph

MIN_DROP = 2.0  # yd — less is a step the navmesh already climbs
MAX_DROP = 20.0  # yd — Naxxramas' drop into Gluth's room is ~19; ~65 kills
MAX_ACROSS = 10.0  # yd out from the edge — a run off a ledge carries you forward
DROP_COST_YARDS = 5.0  # the fall itself, on top of the distance across
CELL = MAX_ACROSS


def _segment_distance(a: np.ndarray, b: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Horizontal distance from each point in ``p`` to the segment a-b."""
    ab = b[:2] - a[:2]
    t = np.clip(((p[:, :2] - a[:2]) @ ab) / max(float(ab @ ab), 1e-9), 0.0, 1.0)
    return np.linalg.norm(p[:, :2] - (a[:2] + t[:, None] * ab), axis=1)


def _best_drops(polys: PolyGraph, comp: np.ndarray, big: np.ndarray) -> dict[tuple[int, int], tuple]:
    """The best drop from each piece to each big piece: (score, poly from, poly to, across)."""
    corner_comp = comp[polys.corner_poly]
    keep = big[corner_comp]
    corners, corner_poly, corner_comp = polys.corner[keep], polys.corner_poly[keep], corner_comp[keep]
    cells: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, (x, y) in enumerate(np.floor(corners[:, :2] / CELL).astype(int).tolist()):
        cells[(x, y)].append(i)
    best: dict[tuple[int, int], tuple] = {}
    centroid = polys.centroid
    for (a, b), p in zip(polys.ledge, polys.ledge_poly.tolist()):
        mid = (a + b) / 2
        cx, cy = (int(v) for v in np.floor(mid[:2] / CELL))
        near = [i for dx in (-1, 0, 1) for dy in (-1, 0, 1) for i in cells.get((cx + dx, cy + dy), ())]
        if not near:
            continue
        idx = np.array(near)
        src = comp[p]
        top = min(a[2], b[2])
        drop = top - corners[idx, 2]
        out = mid[:2] - centroid[p, :2]  # away from the polygon the edge belongs to
        past = (corners[idx, :2] - mid[:2]) @ out > 0
        ok = (corner_comp[idx] != src) & (drop >= MIN_DROP) & (drop <= MAX_DROP) & past
        if not ok.any():
            continue
        idx, drop = idx[ok], drop[ok]
        across = _segment_distance(a, b, corners[idx])
        fit = across <= MAX_ACROSS
        if not fit.any():
            continue
        idx, drop, across = idx[fit], drop[fit], across[fit]
        k = int(np.argmin(across + drop / 4))
        score = float(across[k] + drop[k] / 4)
        key = (int(src), int(corner_comp[idx[k]]))
        if key not in best or score < best[key][0]:
            best[key] = (score, p, int(corner_poly[idx[k]]), float(across[k]))
    return best


def find_drops(polys: PolyGraph, comp: np.ndarray, comp_area: np.ndarray, reached: set[int],
               wanted: set[int], min_area: float) -> list[tuple[int, int, float, int]]:
    """Drops ``(poly from, poly to, cost, EDGE_DROP)`` from the ``reached``
    pieces down to the ``wanted`` ones (a boss's floor), through big pieces
    (at least ``min_area`` yd²) only."""
    big = comp_area >= min_area
    best = _best_drops(polys, comp, big)
    by_src: dict[int, list[tuple[float, int, int, int, float, int]]] = defaultdict(list)
    for (src, dst), (score, pa, pb, across) in best.items():
        by_src[src].append((score, dst, pa, pb, across, src))
    heap = [entry for src in reached for entry in by_src.get(src, ())]
    heapq.heapify(heap)
    # The cheapest drop into each piece first reached, and the piece it came from.
    came: dict[int, tuple[int, int, float, int] | None] = {src: None for src in reached}
    while heap:
        _, dst, pa, pb, across, src = heapq.heappop(heap)
        if dst in came:
            continue
        came[dst] = (pa, pb, across, src)
        for entry in by_src.get(dst, ()):
            heapq.heappush(heap, entry)
    out = set()
    for node in wanted - reached:
        while (step := came.get(node)) is not None:
            pa, pb, across, node = step
            out.add((pa, pb, across + DROP_COST_YARDS, EDGE_DROP))
    return sorted(out)
