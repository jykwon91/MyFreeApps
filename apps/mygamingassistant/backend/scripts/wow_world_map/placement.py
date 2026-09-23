"""Place a world position on the zone map a player would look at.

Zone rectangles overlap (their art has margins, and Forever's new zones sit
on top of Classic ones), so containment alone is ambiguous. In order:

1. A capital city's map wins inside its rectangle (Stormwind over Elwynn).
2. The zone the source names, when it names one (flight paths).
3. A zone whose explored-area art is painted under the point — the point is
   on that zone's land, not in its margin.
4. Otherwise the rectangle the point sits deepest inside.
"""
from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass

from scripts.wow_world_map.coords import ZoneBounds, world_to_zone
from scripts.wow_world_map.map_art import WorldMapArt


@dataclass(frozen=True)
class Placement:
    zone: ZoneBounds
    subzone: str
    x: float
    y: float

    def as_row(self) -> list[object]:
        return [self.zone.ui_map_id, self.subzone, round(self.x, 1), round(self.y, 1)]


def place(
    zones: list[ZoneBounds],
    art: WorldMapArt,
    continent: int,
    world_x: float,
    world_y: float,
    *,
    exclude: Collection[int] = (),
    zone_hint: str | None = None,
) -> Placement | None:
    """``zone_hint``: a zone name the source data states (flight paths are
    named "Place, Zone"), used before the painted-art rule — some Forever
    zones paint over their neighbours' land."""
    containing = [
        z for z in zones
        if z.continent == continent and z.ui_map_id not in exclude and z.contains(world_x, world_y)
    ]
    nested = [z for z in containing if z.nested]
    pool = nested or containing
    if not pool:
        return None
    candidates: list[Placement] = []
    for zone in pool:
        x, y = world_to_zone(zone, world_x, world_y)
        candidates.append(Placement(zone, art.subzone(zone.ui_map_id, x, y), x, y))
    if zone_hint:
        hint = zone_hint.lower()
        named = [
            c for c in candidates
            if c.zone.name.lower().startswith(hint) or hint.startswith(c.zone.name.lower())
        ]
        if named:
            candidates = named
    painted = [c for c in candidates if c.subzone]
    return max(painted or candidates, key=lambda c: c.zone.margin(world_x, world_y))
