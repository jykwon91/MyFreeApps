"""Reader for the navmesh polygon files written by ``navmesh.mjs``."""
from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

NULL_INDEX = 0xFFFF
BORDER_FLAG = 0x8000
RECAST_WATER_AREA = 1


@dataclass
class PolyMesh:
    """One Recast tile: polygons with world-space vertices."""

    row: int  # terrain tile
    col: int
    sx: int  # subtile within the terrain tile (east, south)
    sz: int
    cells: np.ndarray  # (nverts, 3) uint16 cell coords (x east, y up, z south)
    world: np.ndarray  # (nverts, 3) float64 world X, Y, Z
    polys: np.ndarray  # (npolys, nvp) vertex indices, NULL_INDEX padded
    neis: np.ndarray  # (npolys, nvp) neighbour poly / BORDER_FLAG | side / NULL_INDEX
    water: np.ndarray  # (npolys,) bool


def read_nav(path: Path) -> list[PolyMesh]:
    data = path.read_bytes()
    if data[:4] != b"MGAN":
        raise ValueError(f"{path}: not a navmesh file")
    row, col, cs, ch, nvp, nparts = struct.unpack_from("<2i2f2I", data, 4)
    off = 28
    out = []
    for _ in range(nparts):
        sx, sz, bx, by, bz, nverts, npolys = struct.unpack_from("<2H3f2I", data, off)
        off += 24
        cells = np.frombuffer(data, dtype="<u2", count=nverts * 3, offset=off).reshape(-1, 3)
        off += nverts * 6
        polys = np.frombuffer(data, dtype="<u2", count=npolys * nvp * 2, offset=off).reshape(-1, nvp * 2)
        off += npolys * nvp * 4
        areas = np.frombuffer(data, dtype="u1", count=npolys, offset=off)
        off += npolys
        rx = bx + cells[:, 0] * cs
        ry = by + cells[:, 1] * ch
        rz = bz + cells[:, 2] * cs
        world = np.stack([-rz, -rx, ry], axis=1).astype(np.float64)
        out.append(PolyMesh(row, col, sx, sz, cells, world, polys[:, :nvp].astype(np.int32),
                            polys[:, nvp:].astype(np.int32), areas == RECAST_WATER_AREA))
    return out
