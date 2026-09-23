"""World position <-> zone-map percent conversion (Classic client map bounds).

WoW world axes: +X points north, +Y points west. A zone map's horizontal axis
therefore follows -Y and its vertical axis follows -X. Blizzard's
``UiMapAssignment`` row for a zone gives the world rectangle drawn on that
map (``Region_0..5`` = minX, minY, minZ, maxX, maxY, maxZ) and the part of the
map texture it covers (``UiMin``/``UiMax``, 0..1 for every Classic zone).

    x% = UiMin_x + (maxY - worldY) / (maxY - minY) * (UiMax_x - UiMin_x)
    y% = UiMin_y + (maxX - worldX) / (maxX - minX) * (UiMax_y - UiMin_y)

The frontend runs the inverse (``zoneToWorld`` in ``worldMap/geometry.ts``)
to measure straight-line yards between two zone positions.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ZoneBounds:
    ui_map_id: int
    name: str
    continent: int  # Map.ID of the world map: 0 = Eastern Kingdoms, 1 = Kalimdor
    min_x: float
    max_x: float
    min_y: float
    max_y: float
    ui_min_x: float = 0.0
    ui_min_y: float = 0.0
    ui_max_x: float = 1.0
    ui_max_y: float = 1.0
    # A capital city's map sits wholly inside its parent zone's rectangle.
    nested: bool = False

    def contains(self, world_x: float, world_y: float) -> bool:
        return self.min_x <= world_x <= self.max_x and self.min_y <= world_y <= self.max_y

    def margin(self, world_x: float, world_y: float) -> float:
        """How deep inside the rectangle the point is, 0 (edge) .. 0.5 (centre)."""
        fx = (world_x - self.min_x) / (self.max_x - self.min_x)
        fy = (world_y - self.min_y) / (self.max_y - self.min_y)
        return min(fx, 1 - fx, fy, 1 - fy)


def world_to_zone(bounds: ZoneBounds, world_x: float, world_y: float) -> tuple[float, float]:
    """Return ``(x, y)`` map percent (0..100) for a world position."""
    fx = (bounds.max_y - world_y) / (bounds.max_y - bounds.min_y)
    fy = (bounds.max_x - world_x) / (bounds.max_x - bounds.min_x)
    x = bounds.ui_min_x + fx * (bounds.ui_max_x - bounds.ui_min_x)
    y = bounds.ui_min_y + fy * (bounds.ui_max_y - bounds.ui_min_y)
    return x * 100.0, y * 100.0


def zone_to_world(bounds: ZoneBounds, x_pct: float, y_pct: float) -> tuple[float, float]:
    """Inverse of :func:`world_to_zone` - returns ``(world_x, world_y)``."""
    fx = (x_pct / 100.0 - bounds.ui_min_x) / (bounds.ui_max_x - bounds.ui_min_x)
    fy = (y_pct / 100.0 - bounds.ui_min_y) / (bounds.ui_max_y - bounds.ui_min_y)
    world_y = bounds.max_y - fx * (bounds.max_y - bounds.min_y)
    world_x = bounds.max_x - fy * (bounds.max_x - bounds.min_x)
    return world_x, world_y


def pick_zone(
    zones: list[ZoneBounds], continent: int, world_x: float, world_y: float
) -> ZoneBounds | None:
    """Choose the zone map a world position belongs on.

    The client decides by the terrain's area id, which a spawn table does not
    carry, so we decide by rectangles:

    1. A capital city's map (``nested``) wins whenever the point is inside it
       — the city rectangle sits inside its parent zone's (Stormwind City in
       Elwynn Forest, Ironforge in Dun Morogh, Undercity in Tirisfal Glades),
       and the in-game map for a point there is the city map.
    2. Otherwise neighbouring zone rectangles overlap at their borders; pick
       the one the point sits DEEPEST inside.
    """
    containing = [
        z for z in zones if z.continent == continent and z.contains(world_x, world_y)
    ]
    nested = [z for z in containing if z.nested]
    pool = nested or containing
    if not pool:
        return None
    return max(pool, key=lambda z: z.margin(world_x, world_y))
