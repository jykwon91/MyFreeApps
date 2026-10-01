"""Which building floor a point stands on.

A navmesh polygon inside a building's bounding box isn't necessarily in the
building: boxes are axis-aligned and overlap the street outside, and a
shop's box can swallow the road in front of it. The room a polygon is in is
the one whose floor is right under it — the walkable triangle directly
below its centre, within a step or two.

Whether that room is indoors is for ``walk_graph`` to say: a roof test
can't — half of Stormwind's streets have an arch, a tree or a city wall
somewhere over them.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import cache

import numpy as np

from scripts.wow_world_map.walk import models
from scripts.wow_world_map.walk.geometry import MIN_UP
from scripts.wow_world_map.walk.terrain import Placement
from scripts.wow_world_map.walk.transform import apply, placement_matrix

CELL = 4.0  # yd: grid the triangles are binned in
FLOOR_BELOW = 3.0  # a floor this far under a point still carries it (navmesh heights are approximate)
FLOOR_ABOVE = 1.5  # ... or this far over it
EPS = 1e-6


@dataclass
class Triangles:
    """Corners ``a``, ``b``, ``c`` of each triangle, world space, (k, 3) each."""

    a: np.ndarray
    b: np.ndarray
    c: np.ndarray


@dataclass
class Floors:
    """A placed building's walkable triangles and the room (WMO group) each
    belongs to."""

    walkable: Triangles
    group: np.ndarray  # (k,) WMOAreaTable.WMOGroupID of each walkable triangle
    interior: np.ndarray  # (k,) bool: that group is flagged interior


@cache
def _wmo(file_data_id: int) -> models.Wmo:
    return models.load_wmo(file_data_id)


def building_floors(b: Placement) -> tuple[int, Floors]:
    """``(wmo id, floors)`` of a placed building."""
    wmo = _wmo(b.file_data_id)
    m = placement_matrix(b)
    walk, groups, interior = [], [], []
    for g in wmo.groups:
        if not len(g.mesh.triangles):
            continue
        t = apply(m, g.mesh)[g.mesh.triangles]
        n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
        up = np.abs(n[:, 2]) >= MIN_UP * np.maximum(np.linalg.norm(n, axis=1), EPS)
        walk.append(t[up])
        groups.append(np.full(int(up.sum()), g.group_id))
        interior.append(np.full(int(up.sum()), g.interior))
    if not walk:
        return wmo.wmo_id, Floors(_triangles([]), np.zeros(0, np.int64), np.zeros(0, bool))
    return wmo.wmo_id, Floors(_triangles(walk), np.concatenate(groups), np.concatenate(interior))


def _triangles(parts: list[np.ndarray]) -> Triangles:
    t = np.concatenate(parts) if parts else np.zeros((0, 3, 3))
    return Triangles(t[:, 0], t[:, 1], t[:, 2])


def _over(points: np.ndarray, tris: Triangles) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Every (point, triangle) pair where the triangle covers the point in XY,
    with the triangle's height there: ``(point index, triangle index, z)``."""
    a, b, c = tris.a, tris.b, tris.c
    if not len(points) or not len(a):
        return np.zeros(0, np.int64), np.zeros(0, np.int64), np.zeros(0)
    # Bin each triangle into every grid cell its XY bounds touch.
    lo = np.floor(np.minimum(np.minimum(a, b), c)[:, :2] / CELL).astype(np.int64)
    hi = np.floor(np.maximum(np.maximum(a, b), c)[:, :2] / CELL).astype(np.int64)
    span = hi - lo + 1
    counts = span[:, 0] * span[:, 1]
    tri = np.repeat(np.arange(len(a)), counts)
    offset = np.arange(len(tri)) - np.repeat(np.cumsum(counts) - counts, counts)
    keys = _key(lo[tri, 0] + offset // span[tri, 1], lo[tri, 1] + offset % span[tri, 1])
    order = np.argsort(keys, kind="stable")
    keys, tri = keys[order], tri[order]
    # Pair each point with the triangles in its cell.
    pc = np.floor(points[:, :2] / CELL).astype(np.int64)
    pk = _key(pc[:, 0], pc[:, 1])
    left = np.searchsorted(keys, pk, "left")
    per = np.searchsorted(keys, pk, "right") - left
    pi = np.repeat(np.arange(len(points)), per)
    ti = tri[np.repeat(left, per) + np.arange(len(pi)) - np.repeat(np.cumsum(per) - per, per)]
    # Inside the triangle (in XY), and its height there.
    p, ta, tb, tc = points[pi], a[ti], b[ti], c[ti]
    v0, v1, v2 = tb[:, :2] - ta[:, :2], tc[:, :2] - ta[:, :2], p[:, :2] - ta[:, :2]
    den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]
    ok = np.abs(den) > EPS
    den = np.where(ok, den, 1.0)
    u = (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / den
    v = (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / den
    ok &= (u >= -EPS) & (v >= -EPS) & (u + v <= 1 + EPS)
    z = ta[:, 2] + u * (tb[:, 2] - ta[:, 2]) + v * (tc[:, 2] - ta[:, 2])
    return pi[ok], ti[ok], z[ok]


def floor_under(points: np.ndarray, floors: Floors, below: float = FLOOR_BELOW,
                above: float = FLOOR_ABOVE) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """For each point ``(x, y, z)``: the height of the highest floor under it
    (NaN where none), that floor's WMO group id (-1) and its interior flag."""
    best_z = np.full(len(points), np.nan)
    best_group = np.full(len(points), -1, dtype=np.int64)
    best_interior = np.zeros(len(points), dtype=bool)
    pi, ti, z = _over(points, floors.walkable)
    dz = points[pi, 2] - z
    keep = (dz <= below) & (dz >= -above)
    pi, z, ti = pi[keep], z[keep], ti[keep]
    # Highest floor per point: sort by (point, z) and keep each point's last.
    order = np.lexsort((z, pi))
    pi, z, ti = pi[order], z[order], ti[order]
    last = np.r_[pi[1:] != pi[:-1], True] if len(pi) else np.zeros(0, bool)
    best_z[pi[last]] = z[last]
    best_group[pi[last]] = floors.group[ti[last]]
    best_interior[pi[last]] = floors.interior[ti[last]]
    return best_z, best_group, best_interior


def _key(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    return ((x + (1 << 30)) << 32) | (y + (1 << 30))
