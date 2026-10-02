"""Fit the raid post into Discord's limits without rendering every level of detail.

The post gives up detail level by level until it fits (see ``raid_embed``).
Rendering each level in full would cost levels × fields × players, and a
long list adds a level per name.  Instead each list is rendered once per
look, and every level's length comes from running totals:

* :class:`Lines`: a list's entries at one look, joined by a separator.  Its
  length with the first *cap* shown (the rest "+N more") is O(1).
* :class:`FittedField`: an embed field at every level.  A level whose value
  is too long for a field shows the next level that fits.
* :func:`first_fits`: for each level, the first level from it on that fits.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any


def more_text(hidden: int) -> str:
    """What stands in for the entries past a cap."""
    return f"+{hidden} more"


@dataclass(frozen=True)
class Lines:
    """A list's entries joined by *sep*; past a cap, the rest become "+N more"."""

    entries: tuple[str, ...]
    sep: str
    ends: tuple[int, ...]  # ends[k]: the first k entries, each followed by sep

    @classmethod
    def of(cls, entries: Sequence[str], sep: str) -> Lines:
        ends = [0]
        for entry in entries:
            ends.append(ends[-1] + len(entry) + len(sep))
        return cls(tuple(entries), sep, tuple(ends))

    def length(self, cap: int | None) -> int:
        """``len(self.value(cap))``, without building it."""
        shown, hidden = self._split(cap)
        if hidden:
            return self.ends[shown] + len(more_text(hidden))
        return max(self.ends[shown] - len(self.sep), 0)

    def value(self, cap: int | None) -> str:
        shown, hidden = self._split(cap)
        parts = list(self.entries[:shown])
        if hidden:
            parts.append(more_text(hidden))
        return self.sep.join(parts)

    def _split(self, cap: int | None) -> tuple[int, int]:
        """(entries shown, entries hidden) under *cap*; None shows them all."""
        shown = len(self.entries)
        if cap is not None:
            shown = min(cap, shown)
        return shown, len(self.entries) - shown


def first_fits(lengths: Sequence[int], limit: int) -> list[int]:
    """For each level, the first level from it on within *limit*; else the last level."""
    fits = list(range(len(lengths)))
    for level in range(len(lengths) - 2, -1, -1):
        if lengths[level] > limit:
            fits[level] = fits[level + 1]
    return fits


@dataclass(frozen=True)
class FittedField:
    """An embed field at every level of detail."""

    name: str
    levels: tuple[tuple[Lines, int | None], ...]  # (lines, cap) per level
    fits: tuple[int, ...]  # level → the level whose value it shows
    inline: bool

    @classmethod
    def of(
        cls, name: str, levels: Sequence[tuple[Lines, int | None]], *, limit: int, inline: bool = False
    ) -> FittedField:
        """A level whose value is longer than *limit* shows the next level that fits."""
        fits = first_fits([lines.length(cap) for lines, cap in levels], limit)
        return cls(name, tuple(levels), tuple(fits), inline)

    @classmethod
    def fixed(cls, name: str, value: str, *, levels: int) -> FittedField:
        """A field that reads the same at every level."""
        return cls(name, ((Lines.of([value], ""), None),) * levels, tuple(range(levels)), False)

    def length(self, level: int) -> int:
        """What the field adds to the embed's total at *level*: its name and its value."""
        lines, cap = self.levels[self.fits[level]]
        return len(self.name) + lines.length(cap)

    def field(self, level: int) -> dict[str, Any]:
        lines, cap = self.levels[self.fits[level]]
        return {"name": self.name, "value": lines.value(cap), "inline": self.inline}
