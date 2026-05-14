"""Polygon geometry helpers for map zones.

Pure functions over the normalized 0-1 polygon_points format used by MapZone:
    [{"x": 0.12, "y": 0.34}, {"x": 0.45, "y": 0.67}, ...]

Used to derive minimap fallback coordinates when a lineup has no explicit
stand_anchor / target_anchor set: the API returns the zone centroid so the
frontend can render a pin without per-lineup precision data.
"""
from __future__ import annotations

from typing import Sequence


def polygon_centroid(points: Sequence[dict]) -> tuple[float, float]:
    """Return the geometric centroid (cx, cy) of the polygon.

    Uses the shoelace formula so non-convex polygons return a centroid inside
    (or near) the shape — vertex-mean would drift outside for L-shaped zones.

    Falls back to vertex mean when the polygon is degenerate (collinear or
    fewer than 3 vertices), and to the map midpoint (0.5, 0.5) when empty so
    callers never have to null-check coordinates.
    """
    if not points:
        return 0.5, 0.5

    n = len(points)
    if n < 3:
        return (
            sum(p["x"] for p in points) / n,
            sum(p["y"] for p in points) / n,
        )

    a2 = 0.0  # twice the signed area
    cx = 0.0
    cy = 0.0
    for i in range(n):
        x0, y0 = points[i]["x"], points[i]["y"]
        x1, y1 = points[(i + 1) % n]["x"], points[(i + 1) % n]["y"]
        cross = x0 * y1 - x1 * y0
        a2 += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross

    if a2 == 0:
        return (
            sum(p["x"] for p in points) / n,
            sum(p["y"] for p in points) / n,
        )

    return cx / (3 * a2), cy / (3 * a2)
