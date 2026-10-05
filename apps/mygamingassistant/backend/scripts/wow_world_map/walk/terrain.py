"""Terrain tiles (ADT) of a map: height grid, holes, sub-area ids, water,
and the buildings (WMO) + props (M2) placed on them.

A map is a 64x64 grid of 533.33-yard tiles listed in its WDT (``MAID``: the
FileDataIDs of each tile's split files). A tile is 16x16 chunks (MCNK); a
chunk is a 9x9 outer + 8x8 inner height grid whose header carries its world
position — ``(X, Y, baseZ)`` of its north-west corner, X north, Y west.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass, field

import numpy as np

from scripts.wow_world_map.walk.client_files import chunk_map, chunks, client_file

TILE_SIZE = 1600.0 / 3.0  # yards
CHUNK_SIZE = TILE_SIZE / 16.0
UNIT = CHUNK_SIZE / 8.0  # spacing of the outer height grid
MAP_ORIGIN = 32.0 * TILE_SIZE  # placement coordinates count from here

MCNK_HEADER = 128
FLAG_HIGH_RES_HOLES = 0x10000
# MODF / MDDF flag: the name id is a FileDataID (always, in this client).
MODF_NAME_IS_FILEDATAID = 0x8
MDDF_NAME_IS_FILEDATAID = 0x40


@dataclass(frozen=True)
class TileFiles:
    row: int  # grid row: world X falls as it grows
    col: int  # grid column: world Y falls as it grows
    root: int
    obj0: int
    tex0: int = 0  # ground textures (``roads.py``)


@dataclass(frozen=True)
class Placement:
    """One building / prop instance, in world coordinates."""

    file_data_id: int
    unique_id: int
    position: tuple[float, float, float]
    rotation: tuple[float, float, float]  # degrees, as stored (placement order)
    scale: float
    doodad_set: int = 0
    # World XY bounds (min X, min Y, max X, max Y) — stored for buildings only.
    extents: tuple[float, float, float, float] | None = None
    heights: tuple[float, float] | None = None  # world Z range, buildings only
    name_set: int = 0  # WMOAreaTable.NameSetID, buildings only


@dataclass
class Liquid:
    """One water surface patch on a chunk's 8x8 quad grid."""

    heights: np.ndarray  # (h+1, w+1) world Z of the surface vertices
    exists: np.ndarray  # (h, w) bool: which quads carry liquid
    x_offset: int
    y_offset: int
    kind: int  # LiquidType id


@dataclass
class Chunk:
    north: float  # world X of the chunk's north edge
    west: float  # world Y of the chunk's west edge
    area_id: int
    outer: np.ndarray  # (9, 9) world Z
    inner: np.ndarray  # (8, 8) world Z
    holes: np.ndarray  # (8, 8) bool: quad is a hole in the terrain
    liquids: list[Liquid] = field(default_factory=list)
    # (8, 8) bool: open water that brings on fatigue — a swimmer drowns there.
    deep: np.ndarray = field(default_factory=lambda: np.zeros((8, 8), dtype=bool))


def map_tiles(wdt_file_data_id: int) -> list[TileFiles]:
    maid = chunk_map(client_file(wdt_file_data_id)).get("MAID", b"")
    tiles = []
    for i in range(len(maid) // 32):
        root, obj0, _obj1, tex0 = struct.unpack_from("<4I", maid, i * 32)
        if root:
            tiles.append(TileFiles(i // 64, i % 64, root, obj0, tex0))
    return tiles


def global_wmo(wdt_file_data_id: int) -> Placement | None:
    """A WMO-only map (a dungeon) has one building placed by its WDT."""
    modf = chunk_map(client_file(wdt_file_data_id)).get("MODF", b"")
    if len(modf) < 64:
        return None
    return _modf(modf, 0, origin=0.0)


def _world(px: float, py: float, pz: float, origin: float = MAP_ORIGIN) -> tuple[float, float, float]:
    """Placement coordinates (x = west-east, y = up, z = north-south) -> world."""
    return origin - pz, origin - px, py


def _modf(data: bytes, offset: int, origin: float = MAP_ORIGIN) -> Placement:
    """One MODF entry. An ADT's placements are offset by the map origin; the
    WDT's own (a dungeon's one building) are centred on 0 — ``origin=0``."""
    (fid, uid, px, py, pz, rx, ry, rz) = struct.unpack_from("<2I6f", data, offset)
    lo_x, lo_y, lo_z, hi_x, hi_y, hi_z = struct.unpack_from("<6f", data, offset + 32)
    _flags, doodad_set, name_set, scale = struct.unpack_from("<4H", data, offset + 56)
    extents = (origin - hi_z, origin - hi_x, origin - lo_z, origin - lo_x)
    return Placement(fid, uid, _world(px, py, pz, origin), (rx, ry, rz), (scale or 1024) / 1024.0, doodad_set,
                     extents, (lo_y, hi_y), name_set)


def placements(obj0: bytes) -> tuple[list[Placement], list[Placement]]:
    """``(buildings, props)`` placed on a tile (ids are FileDataIDs)."""
    c = chunk_map(obj0)
    modf, mddf = c.get("MODF", b""), c.get("MDDF", b"")
    buildings = []
    for i in range(len(modf) // 64):
        (flags,) = struct.unpack_from("<H", modf, i * 64 + 56)
        if flags & MODF_NAME_IS_FILEDATAID:
            buildings.append(_modf(modf, i * 64))
    props = []
    for i in range(len(mddf) // 36):
        fid, uid, px, py, pz, rx, ry, rz, scale, flags = struct.unpack_from("<2I6f2H", mddf, i * 36)
        if flags & MDDF_NAME_IS_FILEDATAID:
            props.append(Placement(fid, uid, _world(px, py, pz), (rx, ry, rz), scale / 1024.0))
    return buildings, props


def _holes(header: bytes, flags: int) -> np.ndarray:
    holes = np.zeros((8, 8), dtype=bool)
    if flags & FLAG_HIGH_RES_HOLES:
        rows = header[0x14:0x1C]
        for r in range(8):
            for c in range(8):
                holes[r, c] = bool(rows[r] >> c & 1)
    else:
        (low,) = struct.unpack_from("<H", header, 0x3C)
        for bit in range(16):
            if low >> bit & 1:
                r, c = divmod(bit, 4)
                holes[r * 2:r * 2 + 2, c * 2:c * 2 + 2] = True
    return holes


def _deep(mh2o: bytes, index: int) -> np.ndarray:
    """The chunk's fatigue quads: the ``deep`` mask of its MH2O attributes
    (``u64 fishable, u64 deep``, one bit a quad, row by row)."""
    ofs_instances, layer_count, ofs_attr = struct.unpack_from("<3I", mh2o, index * 12)
    if not layer_count or not ofs_attr:
        return np.zeros((8, 8), dtype=bool)
    (bits,) = struct.unpack_from("<Q", mh2o, ofs_attr + 8)
    return np.array([bits >> i & 1 for i in range(64)], dtype=bool).reshape(8, 8)


def _liquids(mh2o: bytes, index: int) -> list[Liquid]:
    ofs_instances, layer_count, _ofs_attr = struct.unpack_from("<3I", mh2o, index * 12)
    out = []
    for layer in range(layer_count):
        base = ofs_instances + layer * 24
        kind, lvf, min_h, _max_h, xo, yo, w, h, ofs_exists, ofs_verts = struct.unpack_from(
            "<2H2f4B2I", mh2o, base
        )
        exists = np.ones((h, w), dtype=bool)
        if ofs_exists:
            bits = int.from_bytes(mh2o[ofs_exists:ofs_exists + (w * h + 7) // 8], "little")
            exists = np.array([bits >> i & 1 for i in range(w * h)], dtype=bool).reshape(h, w)
        heights = np.full((h + 1, w + 1), min_h, dtype=np.float32)
        # Vertex formats 0 (height + depth), 1 (height + uv) and 3 carry
        # heights first; 2 (depth only) is flat at the instance height.
        if ofs_verts and lvf in (0, 1, 3):
            n = (w + 1) * (h + 1)
            heights = np.frombuffer(mh2o, dtype="<f4", count=n, offset=ofs_verts).reshape(h + 1, w + 1)
        out.append(Liquid(heights.astype(np.float32), exists, xo, yo, kind))
    return out


def terrain_chunks(root: bytes) -> list[Chunk]:
    mh2o = next((d for t, d in chunks(root) if t == "MH2O"), b"")
    out = []
    for index, data in enumerate(d for t, d in chunks(root) if t == "MCNK"):
        (flags,) = struct.unpack_from("<I", data, 0)
        (area_id,) = struct.unpack_from("<I", data, 0x34)
        north, west, base = struct.unpack_from("<3f", data, 0x68)
        sub = chunk_map(data[MCNK_HEADER:])
        mcvt = np.frombuffer(sub["MCVT"], dtype="<f4", count=145) + base
        rows = [mcvt[i * 17:i * 17 + 17] for i in range(9)]
        outer = np.stack([r[:9] for r in rows])
        inner = np.stack([r[9:] for r in rows[:8]])
        chunk = Chunk(north, west, area_id, outer, inner, _holes(data, flags))
        if mh2o:
            chunk.liquids = _liquids(mh2o, index)
            chunk.deep = _deep(mh2o, index)
        out.append(chunk)
    return out


def chunk_areas(root: bytes) -> list[tuple[float, float, int]]:
    """``(north, west, area id)`` of each chunk — the terrain's sub-area map."""
    out = []
    for tag, data in chunks(root):
        if tag == "MCNK":
            (area_id,) = struct.unpack_from("<I", data, 0x34)
            north, west = struct.unpack_from("<2f", data, 0x68)
            out.append((north, west, area_id))
    return out
