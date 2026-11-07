"""World position -> the continent's minimap grid.

A continent is a 64x64 grid of terrain tiles (ADTs), each 533.333 yards
square, centred on the world origin at tile (32, 32). The client draws one
minimap texture per ADT, top-down with north up. World axes: +X points north,
+Y points west, so a tile column grows as world Y falls and a row grows as
world X falls — the same orientation as a zone map's 0..100 frame
(``scripts/wow_world_map/coords.py``)::

    column = 32 - worldY / 533.333
    row    = 32 - worldX / 533.333

A zone's ``UiMapAssignment`` rectangle is therefore an axis-aligned box on
that grid, and cropping the box out of the stitched minimap and stretching it
to the zone art's frame lines it up with every marker.
"""
from __future__ import annotations

from typing import Final

from scripts.wow_satellite.crop import Crop
from scripts.wow_world_map.coords import ZoneBounds

ADT_YARDS: Final = 1600.0 / 3.0
GRID_SIZE: Final = 64
GRID_CENTRE: Final = GRID_SIZE // 2


def world_to_grid_px(world_x: float, world_y: float, tile_px: int) -> tuple[float, float]:
    """``(x, y)`` on the stitched continent minimap, ``tile_px`` pixels per ADT."""
    return (
        (GRID_CENTRE - world_y / ADT_YARDS) * tile_px,
        (GRID_CENTRE - world_x / ADT_YARDS) * tile_px,
    )


def zone_crop(bounds: ZoneBounds, tile_px: int) -> Crop:
    """The minimap box drawn on a zone map's 0..100 frame (its north-west corner is 0, 0)."""
    left, top = world_to_grid_px(bounds.max_x, bounds.max_y, tile_px)
    right, bottom = world_to_grid_px(bounds.min_x, bounds.min_y, tile_px)
    return Crop(left, top, right, bottom)


def tiles_covering(crop: Crop, tile_px: int) -> list[tuple[int, int]]:
    """Every grid ``(column, row)`` the box touches, clipped to the 64x64 grid."""
    first_col = max(0, int(crop.left // tile_px))
    last_col = min(GRID_SIZE - 1, int((crop.right - 1e-6) // tile_px))
    first_row = max(0, int(crop.top // tile_px))
    last_row = min(GRID_SIZE - 1, int((crop.bottom - 1e-6) // tile_px))
    return [(c, r) for r in range(first_row, last_row + 1) for c in range(first_col, last_col + 1)]
