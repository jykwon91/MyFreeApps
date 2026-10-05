"""The walk graph of a map, part 1: navmesh polygons joined across tiles and
labelled with the in-game area they lie in. ``clusters.py`` then groups
them into the page's graph nodes.

1. **Polygon graph.** Every Recast tile's polygons with their neighbour
   links; edges on a tile border are matched to the neighbouring tile's
   border edges (same line, overlapping span, heights within a step).
2. **Labels.** A polygon standing on a building room's floor takes the
   room's name from ``WMOAreaTable`` ("The Great Forge"); otherwise its
   terrain chunk's ``AreaTable`` sub-area ("Kharanos"), under the zone
   ("Dun Morogh"). Labels also say whether that's indoors — a room in a
   group flagged interior whose WMOAreaTable row isn't flagged outdoors
   (Stormwind's streets are "interior" groups of the city WMO, flagged
   outdoors; its shops aren't) — and whether the zone is a capital city,
   where directions go turn by turn.

Arrays are numpy / flat lists throughout: a continent has millions of polygons.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from scripts.wow_world_map import sources
from scripts.wow_world_map.walk import terrain
from scripts.wow_world_map.walk.client_files import client_file
from scripts.wow_world_map.walk.floors import building_floors, floor_under
from scripts.wow_world_map.walk.navfile import BORDER_FLAG, CELLS, NULL_INDEX, read_nav
from scripts.wow_world_map.walk.terrain import CHUNK_SIZE, MAP_ORIGIN, Placement

MAX_STEP = 1.5  # yd of height mismatch allowed where two tiles' edges meet
AREA_CAPITAL = 0x100  # AreaTable.Flags_0: the zone is a capital city
ROOM_OUTDOORS = 0x4  # WMOAreaTable.Flags: open air — a street, a square, a cavern hall you can mount in


@dataclass
class PolyGraph:
    centroid: np.ndarray  # (n, 3) world X, Y, Z
    area: np.ndarray  # (n,) yd²
    water: np.ndarray  # (n,) bool
    road: np.ndarray  # (n,) bool: ground painted as road (``roads.py``)
    indptr: np.ndarray  # CSR neighbour lists
    indices: np.ndarray
    # With ``load_polys(..., ledges=True)`` (a dungeon): the open edges — a
    # polygon side with no floor past it, where you could step off — and every
    # polygon corner, for ``drops.py``.
    ledge: np.ndarray | None = None  # (k, 2, 3) the edge's two ends
    ledge_poly: np.ndarray | None = None  # (k,)
    corner: np.ndarray | None = None  # (c, 3)
    corner_poly: np.ndarray | None = None  # (c,)

    def __len__(self) -> int:
        return len(self.area)


@dataclass(frozen=True)
class Label:
    name: str  # room or sub-area: "The Great Forge", "Kharanos" (or the zone itself)
    zone: str  # "Ironforge", "Dun Morogh"
    indoor: bool
    city: bool  # the zone is a capital city


# --- polygon graph ----------------------------------------------------------

def _poly_shapes(world: np.ndarray, polys: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Centroid and area of each polygon (NULL_INDEX-padded vertex lists)."""
    valid = polys != NULL_INDEX
    idx = np.where(valid, polys, 0)
    pts = world[idx]  # (np, nvp, 3)
    count = valid.sum(axis=1, keepdims=True)
    centroid = (pts * valid[..., None]).sum(axis=1) / count
    area = np.zeros(len(polys))
    for k in range(1, polys.shape[1] - 1):
        a, b, c = pts[:, 0, :2], pts[:, k, :2], pts[:, k + 1, :2]
        cross = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
        area += np.where(valid[:, k + 1], 0.5 * np.abs(cross), 0.0)
    return centroid, area


def _border_edge(mesh, p: int, j: int) -> tuple[tuple, int, int, float, float] | None:
    """A tile-border edge's shared line key, span (global cells) and heights."""
    side = int(mesh.neis[p, j]) & 0xF
    verts = [int(v) for v in mesh.polys[p] if v != NULL_INDEX]
    if j >= len(verts):
        return None
    va, vb = verts[j], verts[(j + 1) % len(verts)]
    gx0 = (mesh.col * mesh.subtiles + mesh.sx) * CELLS
    gz0 = (mesh.row * mesh.subtiles + mesh.sz) * CELLS
    # West / east edges run along z (south); north / south edges along x (east).
    if side in (0, 2):
        key = ("x", gx0 + (CELLS if side == 2 else 0), gz0)
        a, b = gz0 + int(mesh.cells[va, 2]), gz0 + int(mesh.cells[vb, 2])
    else:
        key = ("z", gz0 + (CELLS if side == 1 else 0), gx0)
        a, b = gx0 + int(mesh.cells[va, 0]), gx0 + int(mesh.cells[vb, 0])
    za, zb = float(mesh.world[va, 2]), float(mesh.world[vb, 2])
    if a > b:
        a, b, za, zb = b, a, zb, za
    return (key, side), a, b, za, zb


def _open_edges(mesh, base: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """A tile's open edges (no neighbour, not on the tile border) and its polygons' corners."""
    valid = mesh.polys != NULL_INDEX
    count = valid.sum(axis=1)
    j = np.arange(mesh.polys.shape[1])
    nxt = np.where(j[None, :] + 1 < count[:, None], j[None, :] + 1, 0)
    rows = np.arange(len(mesh.polys))[:, None]
    open_ = valid & (mesh.neis == NULL_INDEX)
    p, k = np.nonzero(open_)
    a = mesh.world[mesh.polys[p, k]]
    b = mesh.world[mesh.polys[rows, nxt][p, k]]
    cp, ck = np.nonzero(valid)
    return np.stack([a, b], axis=1), base + p, mesh.world[mesh.polys[cp, ck]], base + cp


def load_polys(nav_dir: Path, ledges: bool = False) -> PolyGraph:
    centroids, areas, waters, on_road, links = [], [], [], [], []
    opens: list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = []
    # Border edges by shared line: key -> [(side, lo, hi, z at lo, z at hi, poly)]
    borders: dict[tuple, list[tuple[int, int, int, float, float, int]]] = defaultdict(list)
    base = 0
    for path in sorted(nav_dir.glob("*.nav")):
        for mesh in read_nav(path):
            centroid, area = _poly_shapes(mesh.world, mesh.polys)
            centroids.append(centroid)
            areas.append(area)
            waters.append(mesh.water)
            on_road.append(mesh.road)
            present = mesh.neis != NULL_INDEX
            border = present & ((mesh.neis & BORDER_FLAG) != 0)
            inner = present & ~border
            p, _ = np.nonzero(inner)
            if ledges:
                opens.append(_open_edges(mesh, base))
            links.append(np.stack([base + p, base + mesh.neis[inner]], axis=1))
            for p, j in zip(*np.nonzero(border)):
                edge = _border_edge(mesh, int(p), int(j))
                if edge is not None:
                    (key, side), a, b, za, zb = edge
                    borders[key].append((side, a, b, za, zb, base + int(p)))
            base += len(area)
    joined = []
    for edges in borders.values():
        low = [e for e in edges if e[0] in (0, 3)]  # the east / south tile's west / north edge
        high = [e for e in edges if e[0] in (1, 2)]
        for _, a1, b1, za1, zb1, p1 in low:
            for _, a2, b2, za2, zb2, p2 in high:
                lo, hi = max(a1, a2), min(b1, b2)
                if hi - lo < 1:
                    continue
                mid = (lo + hi) / 2
                z1 = za1 + (zb1 - za1) * (mid - a1) / (b1 - a1)
                z2 = za2 + (zb2 - za2) * (mid - a2) / (b2 - a2)
                if abs(z1 - z2) <= MAX_STEP:
                    joined += [(p1, p2), (p2, p1)]
    pairs = np.concatenate(links + [np.array(joined, dtype=np.int64).reshape(-1, 2)]).astype(np.int64)
    pairs = np.unique(pairs, axis=0)
    counts = np.bincount(pairs[:, 0], minlength=base)
    indptr = np.concatenate([[0], np.cumsum(counts)])
    print(f"  polygons: {base}, links: {len(pairs) // 2}, across tile borders: {len(joined) // 2}")
    graph = PolyGraph(np.concatenate(centroids), np.concatenate(areas), np.concatenate(waters),
                      np.concatenate(on_road), indptr, pairs[:, 1].copy())
    if ledges:
        graph.ledge, graph.ledge_poly, graph.corner, graph.corner_poly = (
            np.concatenate([o[i] for o in opens]) for i in range(4))
    return graph


# --- labels -----------------------------------------------------------------

class AreaNames:
    def __init__(self) -> None:
        rows = sources.wago_table("AreaTable")
        self.name = {int(r["ID"]): r["AreaName_lang"].strip() for r in rows}
        self.parent = {int(r["ID"]): int(r["ParentAreaID"]) for r in rows}
        self.flags = {int(r["ID"]): int(r["Flags_0"]) for r in rows}
        self.wmo: dict[tuple[int, int, int], tuple[str, int, bool]] = {}
        for r in sources.wago_table("WMOAreaTable"):
            key = (int(r["WMOID"]), int(r["NameSetID"]), int(r["WMOGroupID"]))
            outdoors = bool(int(r["Flags"]) & ROOM_OUTDOORS)
            self.wmo[key] = (r["AreaName_lang"].strip(), int(r["AreaTableID"]), outdoors)

    def zone_of(self, area_id: int) -> int:
        for _ in range(8):
            parent = self.parent.get(area_id, 0)
            if not parent:
                break
            area_id = parent
        return area_id

    def room(self, wmo_id: int, name_set: int, group_id: int) -> tuple[str, int, bool]:
        """A building room's name, AreaTable id ("" / 0 when it has none) and
        whether it's flagged outdoors."""
        for key in ((wmo_id, name_set, group_id), (wmo_id, name_set, -1), (wmo_id, 0, -1)):
            if key in self.wmo:
                name, area, outdoors = self.wmo[key]
                return name or self.name.get(area, ""), area, outdoors
        return "", 0, False


def _chunk_areas(tiles: list[terrain.TileFiles]) -> dict[tuple[int, int], int]:
    out = {}
    for tile in tiles:
        if not tile.root:  # a dungeon's tiles have no terrain
            continue
        for north, west, area in terrain.chunk_areas(client_file(tile.root)):
            out[(round((MAP_ORIGIN - north) / CHUNK_SIZE), round((MAP_ORIGIN - west) / CHUNK_SIZE))] = area
    return out


def label_polys(polys: PolyGraph, tiles: list[terrain.TileFiles], buildings: list[Placement],
                names: AreaNames) -> tuple[np.ndarray, list[Label]]:
    c = polys.centroid
    chunk_area = _chunk_areas(tiles)
    rows = np.floor((MAP_ORIGIN - c[:, 0]) / CHUNK_SIZE).astype(int)
    cols = np.floor((MAP_ORIGIN - c[:, 1]) / CHUNK_SIZE).astype(int)
    terrain_area = np.array([chunk_area.get(k, 0) for k in zip(rows.tolist(), cols.tolist())], dtype=np.int64)
    # The building floor each polygon stands on (the highest one under it).
    room_names = [""]
    room_name = np.zeros(len(c), dtype=np.int64)
    room_area = np.zeros(len(c), dtype=np.int64)
    room_inside = np.zeros(len(c), dtype=bool)
    floor_z = np.full(len(c), -np.inf)
    for b in buildings:
        if not b.extents or not b.heights:
            continue
        x0, y0, x1, y1 = b.extents
        near = np.nonzero((c[:, 0] >= x0) & (c[:, 0] <= x1) & (c[:, 1] >= y0) & (c[:, 1] <= y1)
                          & (c[:, 2] >= b.heights[0] - 2) & (c[:, 2] <= b.heights[1] + 2))[0]
        if not len(near):
            continue
        wmo_id, floors = building_floors(b)
        z, group, interior = floor_under(c[near], floors)
        on = (group >= 0) & (z > floor_z[near])
        if not on.any():
            continue
        idx, groups = near[on], group[on]
        floor_z[idx] = z[on]
        room_inside[idx] = interior[on]
        for g in np.unique(groups).tolist():
            hit = idx[groups == g]
            name, area, outdoors = names.room(wmo_id, b.name_set, g)
            if outdoors:
                room_inside[hit] = False
            if name not in room_names:
                room_names.append(name)
            room_name[hit] = room_names.index(name)
            room_area[hit] = area
    keys = np.stack([terrain_area, room_name, room_area, room_inside.astype(np.int64)], axis=1)
    unique, inverse = np.unique(keys, axis=0, return_inverse=True)
    canonical: dict[Label, int] = {}
    remap = []
    for t_area, r_name, r_area, inside in unique.tolist():
        zone = names.zone_of(r_area or t_area)
        name = room_names[r_name] or names.name.get(t_area, "")
        city = bool(names.flags.get(zone, 0) & AREA_CAPITAL)
        label = Label(name, names.name.get(zone, ""), bool(inside), city)
        remap.append(canonical.setdefault(label, len(canonical)))
    return np.array(remap)[inverse.ravel()].astype(np.int32), list(canonical)


