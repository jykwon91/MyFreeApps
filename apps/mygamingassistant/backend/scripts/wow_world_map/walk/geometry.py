"""Collision triangles of one terrain tile, ready for the navmesh builder.

Per tile (plus a small margin so neighbouring navmesh tiles join up):

* terrain quads, minus holes (cave mouths, building entrances);
* road: a terrain quad painted with a road texture (``roads.py``) is
  AREA_ROAD, so the navmesh's polygons split along the road's edges;
* water: a quad under more than :data:`WADE_DEPTH` of water becomes the water
  surface (swimmable), shallower water is waded like ground; lava and slime
  quads are dropped;
* every building (WMO) collision triangle, and the collision mesh of each
  prop (M2) — placed on the terrain or inside a building's doodad set.

Triangles are written in Recast's y-up frame — (x, y, z) = (-Y, Z, -X) of
world (X north, Y west, Z up) — with an area per triangle: AREA_NONE
(obstacle), AREA_GROUND, AREA_WATER or AREA_ROAD.
"""
from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from scripts.wow_world_map import sources
from scripts.wow_world_map.walk import models, terrain
from scripts.wow_world_map.walk.client_files import client_file
from scripts.wow_world_map.walk.terrain import CHUNK_SIZE, MAP_ORIGIN, TILE_SIZE, UNIT, Placement, TileFiles
from scripts.wow_world_map.walk.transform import apply, placement_matrix, quaternion_matrix

AREA_NONE = 0
AREA_GROUND = 1
AREA_WATER = 2
AREA_ROAD = 3
MAX_SLOPE_DEGREES = 55.0
MIN_UP = math.cos(math.radians(MAX_SLOPE_DEGREES))
WADE_DEPTH = 1.5  # yards of water a player walks through rather than swims
MARGIN = 8.0  # yards of neighbouring geometry around a tile
LIQUID_WATER_BANKS = {0, 1}  # LiquidType.SoundBank: water, ocean (2 magma, 3 slime)
MAGIC = b"MGAW"


@dataclass(frozen=True)
class Box:
    """World XY bounds (min X, min Y, max X, max Y) — height is never culled."""

    x0: float
    y0: float
    x1: float
    y1: float

    def overlaps(self, other: "Box") -> bool:
        return self.x0 <= other.x1 and other.x0 <= self.x1 and self.y0 <= other.y1 and other.y0 <= self.y1


def tile_box(tile: TileFiles, margin: float = MARGIN) -> Box:
    north = terrain.MAP_ORIGIN - tile.row * TILE_SIZE
    west = terrain.MAP_ORIGIN - tile.col * TILE_SIZE
    return Box(north - TILE_SIZE - margin, west - TILE_SIZE - margin, north + margin, west + margin)


def _slope_areas(verts: np.ndarray, tris: np.ndarray) -> np.ndarray:
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    n = np.cross(b - a, c - a)
    length = np.linalg.norm(n, axis=1)
    up = np.divide(n[:, 2], length, out=np.zeros_like(length), where=length > 0)
    return np.where(up >= MIN_UP, AREA_GROUND, AREA_NONE).astype(np.uint8)


class Soup:
    """Triangles gathered for one tile."""

    def __init__(self) -> None:
        self.verts: list[np.ndarray] = []
        self.tris: list[np.ndarray] = []
        self.areas: list[np.ndarray] = []
        self._n = 0

    def add(self, verts: np.ndarray, tris: np.ndarray, areas: np.ndarray | None = None) -> None:
        if not len(tris):
            return
        if areas is None:
            areas = _slope_areas(verts, tris)
        self.verts.append(verts.astype(np.float32))
        self.tris.append(tris.astype(np.int32) + self._n)
        self.areas.append(areas.astype(np.uint8))
        self._n += len(verts)

    def arrays(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        if not self.tris:
            return np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int32), np.zeros(0, np.uint8)
        return np.concatenate(self.verts), np.concatenate(self.tris), np.concatenate(self.areas)

    def write(self, path: Path, box: Box) -> int:
        verts, tris, areas = self.arrays()
        recast = np.stack([-verts[:, 1], verts[:, 2], -verts[:, 0]], axis=1).astype(np.float32)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        with tmp.open("wb") as f:
            f.write(MAGIC + struct.pack("<2I4f", len(recast), len(tris), box.x0, box.y0, box.x1, box.y1))
            f.write(recast.tobytes())
            f.write(tris.astype(np.int32).tobytes())
            f.write(areas.tobytes())
        tmp.replace(path)
        return len(tris)


def _cull(verts: np.ndarray, tris: np.ndarray, box: Box) -> np.ndarray:
    """Triangles whose XY bounds touch the box."""
    t = verts[tris]
    lo, hi = t.min(axis=1), t.max(axis=1)
    keep = (lo[:, 0] <= box.x1) & (hi[:, 0] >= box.x0) & (lo[:, 1] <= box.y1) & (hi[:, 1] >= box.y0)
    return tris[keep]


@lru_cache(maxsize=None)
def _liquid_banks() -> dict[int, int]:
    return {int(r["ID"]): int(r["SoundBank"]) for r in sources.wago_table("LiquidType")}


def _water_levels(chunk: terrain.Chunk) -> list[list[tuple[float, int] | None]]:
    """Per quad: (surface height, LiquidType sound bank) or None."""
    grid: list[list[tuple[float, int] | None]] = [[None] * 8 for _ in range(8)]
    banks = _liquid_banks()
    for liquid in chunk.liquids:
        h, w = liquid.exists.shape
        for r in range(h):
            for c in range(w):
                qi, qj = liquid.y_offset + r, liquid.x_offset + c
                if liquid.exists[r, c] and qi < 8 and qj < 8:
                    level = float(liquid.heights[r:r + 2, c:c + 2].mean())
                    grid[qi][qj] = (level, banks.get(liquid.kind, 0))
    return grid


def _chunk_mesh(chunk: terrain.Chunk, road: frozenset[tuple[int, int]]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Terrain (ground or road) and deep-water surface triangles of one chunk.
    ``road``: the road quads, by global ``(row, col)`` (``roads.road_map``)."""
    i, j = np.mgrid[0:9, 0:9]
    outer = np.stack([chunk.north - i * UNIT, chunk.west - j * UNIT, chunk.outer], axis=-1).reshape(-1, 3)
    i, j = np.mgrid[0:8, 0:8]
    inner = np.stack([chunk.north - (i + 0.5) * UNIT, chunk.west - (j + 0.5) * UNIT, chunk.inner],
                     axis=-1).reshape(-1, 3)
    verts = [*np.concatenate([outer, inner])]
    ground: list[tuple[int, int, int]] = []
    on_road: list[bool] = []
    water: list[tuple[int, int, int]] = []
    levels = _water_levels(chunk)
    row0, col0 = round((MAP_ORIGIN - chunk.north) / UNIT), round((MAP_ORIGIN - chunk.west) / UNIT)
    for qi in range(8):
        for qj in range(8):
            nw, ne = qi * 9 + qj, qi * 9 + qj + 1
            sw, se = nw + 9, ne + 9
            centre = 81 + qi * 8 + qj
            top = max(verts[k][2] for k in (nw, ne, sw, se, centre))
            liquid = levels[qi][qj]
            if liquid is not None and top < liquid[0]:
                if liquid[1] not in LIQUID_WATER_BANKS:
                    continue  # under lava / slime: not walkable
                if top < liquid[0] - WADE_DEPTH:
                    if chunk.deep[qi, qj]:
                        continue  # open sea: fatigue drowns a swimmer
                    # The swim plane sits at wading depth, level with the wadeable
                    # ground next to it, so walking into the water joins up.
                    swim = liquid[0] - WADE_DEPTH
                    n = len(verts)
                    for a in (0, 1):
                        for b in (0, 1):
                            verts.append(np.array([chunk.north - (qi + a) * UNIT, chunk.west - (qj + b) * UNIT, swim]))
                    # n = NW, n+1 = NE, n+2 = SW, n+3 = SE
                    water += [(n, n + 2, n + 3), (n, n + 3, n + 1)]
                    continue
            if chunk.holes[qi, qj]:
                continue
            # Counter-clockwise seen from above: west is +Y, north is +X.
            ground += [(centre, nw, sw), (centre, sw, se), (centre, se, ne), (centre, ne, nw)]
            on_road += [(row0 + qi, col0 + qj) in road] * 4
    v = np.array(verts, dtype=np.float64)
    g = np.array(ground, dtype=np.int32).reshape(-1, 3)
    w = np.array(water, dtype=np.int32).reshape(-1, 3)
    ground_areas = _slope_areas(v, g) if len(g) else np.zeros(0, np.uint8)
    ground_areas[np.array(on_road, dtype=bool) & (ground_areas == AREA_GROUND)] = AREA_ROAD
    areas = np.concatenate([ground_areas, np.full(len(w), AREA_WATER, np.uint8)])
    return v, np.concatenate([g, w]), areas


@lru_cache(maxsize=64)
def _terrain(root: int) -> tuple[terrain.Chunk, ...]:
    return tuple(terrain.terrain_chunks(client_file(root)))


@lru_cache(maxsize=48)
def _wmo(file_data_id: int) -> models.Wmo:
    return models.load_wmo(file_data_id)


@lru_cache(maxsize=8192)
def m2_mesh(file_data_id: int) -> models.Mesh:
    return models.load_m2_collision(file_data_id)


def mesh_box(matrix: np.ndarray, mesh: models.Mesh) -> Box | None:
    if not len(mesh.triangles):
        return None
    v = apply(matrix, mesh)
    return Box(float(v[:, 0].min()), float(v[:, 1].min()), float(v[:, 0].max()), float(v[:, 1].max()))


def tile_soup(tile: TileFiles, tiles: dict[tuple[int, int], TileFiles],
              buildings: list[tuple[Placement, Box]], props: list[tuple[Placement, Box]],
              road: frozenset[tuple[int, int]] = frozenset()) -> Soup:
    box = tile_box(tile)
    soup = Soup()
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            other = tiles.get((tile.row + dr, tile.col + dc))
            if other is None or not other.root or not tile_box(other, 0).overlaps(box):
                continue
            for chunk in _terrain(other.root):
                cbox = Box(chunk.north - CHUNK_SIZE, chunk.west - CHUNK_SIZE, chunk.north, chunk.west)
                if cbox.overlaps(box):
                    soup.add(*_chunk_mesh(chunk, road))
    for placement, pbox in buildings:
        if not pbox.overlaps(box):
            continue
        wmo = _wmo(placement.file_data_id)
        matrix = placement_matrix(placement)
        for group in wmo.groups:
            if len(group.mesh.triangles):
                verts = apply(matrix, group.mesh)
                soup.add(verts, _cull(verts, group.mesh.triangles, box))
        for s in sorted({0, placement.doodad_set}):
            for doodad in wmo.doodad_sets[s] if s < len(wmo.doodad_sets) else []:
                mesh = m2_mesh(doodad.file_data_id)
                if len(mesh.triangles):
                    verts = apply(matrix @ quaternion_matrix(doodad.position, doodad.rotation, doodad.scale), mesh)
                    soup.add(verts, _cull(verts, mesh.triangles, box))
    for placement, pbox in props:
        if pbox.overlaps(box):
            mesh = m2_mesh(placement.file_data_id)
            verts = apply(placement_matrix(placement), mesh)
            soup.add(verts, _cull(verts, mesh.triangles, box))
    return soup
