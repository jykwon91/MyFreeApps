"""A box on a continent's stitched minimap."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Crop:
    """A box on the continent's minimap, in pixels at ``tile_px`` per ADT."""

    left: float
    top: float
    right: float
    bottom: float

    @property
    def width(self) -> float:
        return self.right - self.left

    @property
    def height(self) -> float:
        return self.bottom - self.top
