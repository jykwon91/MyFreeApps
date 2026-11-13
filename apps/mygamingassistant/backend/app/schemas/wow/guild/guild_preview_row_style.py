from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GuildPreviewRowStyle:
    """One podium row's place in its panel and its font sizes."""

    top: int
    height: int
    name_max: int
    name_min: int
    number_size: int
