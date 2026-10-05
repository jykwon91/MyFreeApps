"""Roads: reading a terrain tile's ground textures, and carving road into the navmesh geometry."""
from __future__ import annotations

import struct

import numpy as np

from scripts.wow_world_map.walk import roads
from scripts.wow_world_map.walk.geometry import AREA_GROUND, AREA_ROAD, _chunk_mesh
from scripts.wow_world_map.walk.roads import MCLY_COMPRESSED, MCLY_USE_ALPHA, _alpha, _stretches, chunk_textures
from scripts.wow_world_map.walk.terrain import CHUNK_SIZE, MAP_ORIGIN, Chunk

ROAD, DIRT = 187000, 188502


def _chunk(tag: str, payload: bytes) -> bytes:
    return tag[::-1].encode("latin-1") + struct.pack("<I", len(payload)) + payload


def _tex0(layers: list[tuple[int, int, bytes]]) -> bytes:
    """One chunk painted with ``(texture index, MCLY flags, alpha bytes)`` layers, bottom first."""
    mcly, mcal = b"", b""
    for texture, flags, alpha in layers:
        mcly += struct.pack("<4I", texture, flags, len(mcal), 0)
        mcal += alpha
    return _chunk("MDID", struct.pack("<2I", DIRT, ROAD)) + _chunk("MCNK", _chunk("MCLY", mcly) + _chunk("MCAL", mcal))


def test_a_4_bit_alpha_map_reads_low_nibble_first() -> None:
    a = _alpha(bytes([0xF0]) * 2048, 0, compressed=False, big=False)
    assert a[0, :2].tolist() == [0.0, 1.0]


def test_a_compressed_alpha_map_fills_and_copies() -> None:
    # fill 64 x 255 (one row), then 63 more rows of copied zeros
    data = bytes([0x80 | 64, 255]) + b"".join(bytes([64]) + bytes(64) for _ in range(63))
    a = _alpha(data, 0, compressed=True, big=True)
    assert a[0].min() == 1.0 and a[1:].max() == 0.0


def test_a_layer_covers_the_ground_below_it() -> None:
    half = bytes([255]) * 2048 + bytes(2048)  # the road over the north half
    (shares,) = chunk_textures(_tex0([(0, 0, b""), (1, MCLY_USE_ALPHA, half)]), big=True)
    share = dict(shares)
    assert share[ROAD][:32].min() == 1.0 and share[ROAD][32:].max() == 0.0
    assert share[DIRT][:32].max() == 0.0 and share[DIRT][32:].min() == 1.0


def test_a_compressed_layer_flag_is_honoured() -> None:
    rle = bytes([0x80 | 127, 255]) * 32 + bytes([0x80 | 32, 255])  # 4096 x 255
    (shares,) = chunk_textures(_tex0([(0, 0, b""), (1, MCLY_USE_ALPHA | MCLY_COMPRESSED, rle)]), big=True)
    assert dict(shares)[ROAD].min() == 1.0


def test_specks_of_road_texture_are_not_road() -> None:
    line = {(0, c) for c in range(roads.MIN_ROAD_CELLS)}
    speck = {(10, 10), (10, 11), (11, 10)}
    assert _stretches(line | speck, roads.MIN_ROAD_CELLS) == line


def test_road_quads_become_road_ground_in_the_navmesh_geometry() -> None:
    chunk = Chunk(north=MAP_ORIGIN - 10 * CHUNK_SIZE, west=MAP_ORIGIN - 20 * CHUNK_SIZE, area_id=0,
                  outer=np.zeros((9, 9)), inner=np.zeros((8, 8)), holes=np.zeros((8, 8), dtype=bool))
    road = frozenset({(10 * 8, 20 * 8 + 1)})  # the chunk's north row, second quad from the west
    _, _, areas = _chunk_mesh(chunk, road)
    quads = areas.reshape(8, 8, 4)  # four triangles a quad, row by row
    assert (quads[0, 1] == AREA_ROAD).all()
    assert (np.delete(quads.reshape(64, 4), 1, axis=0) == AREA_GROUND).all()
