"""The raid post's color — Raid: Edit → Color offers these six.

The event stores the value (``color``); null means the default, Purple.
Grey is how a post shows sign-ups closed or the raid cancelled, so it
isn't on the list.  Each color's swatch in the menu is a standard emoji
circle (Unicode 12), which every Discord client shows.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class RaidColor:
    key: str
    label: str
    value: int
    swatch: str


DEFAULT_COLOR: Final = RaidColor("purple", "Purple", 0x7D3C98, "\U0001F7E3")
RAID_COLORS: Final = (
    DEFAULT_COLOR,
    RaidColor("blue", "Blue", 0x3498DB, "\U0001F535"),
    RaidColor("green", "Green", 0x2ECC71, "\U0001F7E2"),
    RaidColor("gold", "Gold", 0xF1C40F, "\U0001F7E1"),
    RaidColor("orange", "Orange", 0xE67E22, "\U0001F7E0"),
    RaidColor("red", "Red", 0xE74C3C, "\U0001F534"),
)
COLORS_BY_KEY: Final = {color.key: color for color in RAID_COLORS}
_COLORS_BY_VALUE: Final = {color.value: color for color in RAID_COLORS}


def color_of(value: int | None) -> RaidColor | None:
    """The named color for an event's ``color``; the default when unset, None when off the list."""
    if value is None:
        return DEFAULT_COLOR
    return _COLORS_BY_VALUE.get(value)


def stored_value(color: RaidColor) -> int | None:
    """What the event stores for *color*: null for the default."""
    if color == DEFAULT_COLOR:
        return None
    return color.value
