"""WoW Forever walk graph — water a player can swim vs open sea that drowns them (fatigue)."""
from __future__ import annotations

import struct

import numpy as np
import pytest

from scripts.wow_world_map.walk import geometry
from scripts.wow_world_map.walk.geometry import AREA_WATER, _chunk_mesh
from scripts.wow_world_map.walk.terrain import CHUNK_SIZE, MAP_ORIGIN, Chunk, Liquid, _deep


def _mh2o(deep_bits: int) -> bytes:
    """One chunk's MH2O: its header, then the attributes (``u64 fishable, u64 deep``)."""
    header = struct.pack("<3I", 0, 1, 12)
    return header + struct.pack("<2Q", 0, deep_bits)


def test_the_deep_mask_reads_one_bit_a_quad_row_by_row() -> None:
    deep = _deep(_mh2o(1 << 0 | 1 << 9 | 1 << 63), 0)
    assert deep.shape == (8, 8)
    assert {tuple(p) for p in np.argwhere(deep).tolist()} == {(0, 0), (1, 1), (7, 7)}


def test_a_chunk_without_water_has_no_deep_quads() -> None:
    assert not _deep(struct.pack("<3I", 0, 0, 0), 0).any()


def test_open_sea_is_left_out_of_the_swim_plane(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(geometry, "_liquid_banks", lambda: {1: 1})
    sea = Liquid(np.zeros((9, 9), dtype=np.float32), np.ones((8, 8), dtype=bool), 0, 0, 1)
    deep = np.zeros((8, 8), dtype=bool)
    deep[0] = True  # the chunk's north row is open sea
    chunk = Chunk(north=MAP_ORIGIN - 10 * CHUNK_SIZE, west=MAP_ORIGIN - 20 * CHUNK_SIZE, area_id=0,
                  outer=np.full((9, 9), -20.0), inner=np.full((8, 8), -20.0), holes=np.zeros((8, 8), dtype=bool),
                  liquids=[sea], deep=deep)
    _, _, areas = _chunk_mesh(chunk, frozenset())
    # Two swim triangles a quad, for the 7 rows by the shore only.
    assert (areas == AREA_WATER).sum() == 2 * 7 * 8
    assert len(areas) == 2 * 7 * 8
