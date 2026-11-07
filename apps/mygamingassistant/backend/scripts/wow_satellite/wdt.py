"""Which minimap texture each ADT of a continent uses, from its WDT.

Since 8.1 the client lists files by FileDataID instead of by name: the WDT's
``MAID`` chunk holds, for each of the 64x64 cells (row-major, ``row * 64 +
column``), eight ids — root ADT, obj0, obj1, tex0, lod, map texture, map
normal texture, minimap texture. 0 = no such file (open sea).
"""
from __future__ import annotations

import struct
from typing import Final

from scripts.wow_satellite.grid import GRID_SIZE
from scripts.wow_world_map.walk.client_files import chunk_map

MAID_IDS_PER_CELL: Final = 8
MAID_MINIMAP_INDEX: Final = 7


def minimap_file_ids(wdt: bytes) -> dict[tuple[int, int], int]:
    """``{(column, row): minimap texture FileDataID}`` for every cell that has one."""
    maid = chunk_map(wdt).get("MAID")
    if maid is None:
        raise ValueError("WDT has no MAID chunk (a pre-8.1 client lists minimaps in md5translate)")
    cells = GRID_SIZE * GRID_SIZE
    expected = cells * MAID_IDS_PER_CELL * 4
    if len(maid) < expected:
        raise ValueError(f"MAID chunk is {len(maid)} bytes, expected {expected}")
    ids = struct.unpack_from(f"<{cells * MAID_IDS_PER_CELL}I", maid)
    found: dict[tuple[int, int], int] = {}
    for cell in range(cells):
        file_id = ids[cell * MAID_IDS_PER_CELL + MAID_MINIMAP_INDEX]
        if file_id:
            found[(cell % GRID_SIZE, cell // GRID_SIZE)] = file_id
    return found
