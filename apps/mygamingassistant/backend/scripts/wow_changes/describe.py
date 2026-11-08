"""Plain-words descriptions of a change, generated from the two values (pure).

Nothing here judges a change: a number that went up was "raised", one that
went down was "lowered", and text that changed in more than its numbers was
"reworded". The page shows both texts side by side, so the summary only has
to say what moved.
"""
from __future__ import annotations

import re
from collections.abc import Sequence

# The client's colour codes ("|cFFFF2020Requires Cat Form|r") are markup, not text.
_COLOUR = re.compile(r"\|c[0-9A-Fa-f]{8}|\|r", re.IGNORECASE)
_NUMBER = re.compile(r"\d+(?:\.\d+)?%?")
_SPACE = re.compile(r"\s+")
# More moved numbers than this read as a count rather than a list.
MAX_LISTED_NUMBERS = 3


def clean_text(text: str) -> str:
    """A tooltip as a player reads it: colour codes gone, whitespace collapsed."""
    return _SPACE.sub(" ", _COLOUR.sub("", text)).strip()


def _value(token: str) -> float:
    return float(token.rstrip("%"))


def number_changes(old: str, new: str) -> list[tuple[str, str]] | None:
    """The numbers that moved, in order, when nothing but numbers differs; None when the words changed too."""
    if _NUMBER.sub("#", old) != _NUMBER.sub("#", new):
        return None
    return [(a, b) for a, b in zip(_NUMBER.findall(old), _NUMBER.findall(new)) if a != b]


def _joined(parts: Sequence[str]) -> str:
    if len(parts) == 1:
        return parts[0]
    return f"{', '.join(parts[:-1])} and {parts[-1]}"


def describe_numbers(pairs: Sequence[tuple[str, str]]) -> str:
    """"Raised from 10% to 15%." / "Lowered from 31 to 26 and 45 to 38." / "Changed from 2 to 3 and 9 to 8.\""""
    if len(pairs) > MAX_LISTED_NUMBERS:
        return f"{len(pairs)} numbers changed."
    ups = [_value(b) > _value(a) for a, b in pairs]
    verb = "Raised" if all(ups) else "Lowered" if not any(ups) else "Changed"
    return f"{verb} from {_joined([f'{a} to {b}' for a, b in pairs])}."


def describe_text(old: str, new: str) -> str:
    """One sentence on how a tooltip changed."""
    pairs = number_changes(old, new)
    if pairs is None:
        return "Text reworded."
    return describe_numbers(pairs)


def describe_value(label: str, old: float, new: float, unit: str = "") -> str:
    """"Item level raised from 45 to 50.\""""
    verb = "raised" if new > old else "lowered"
    return f"{label} {verb} from {old}{unit} to {new}{unit}."


def describe_ranks(changed: Sequence[tuple[str, str]], rank_count: int) -> str:
    """A talent's or spell's summary from its changed ranks: ``(rank label, that rank's summary)``.

    One rank, or every rank alike: that summary. Otherwise the first changed
    rank's, with how many others changed.
    """
    label, first = changed[0]
    if rank_count == 1:
        return first
    if len(changed) == 1:
        return f"{label}: {first}"
    rest = len(changed) - 1
    return f"{label}: {first} {rest} more rank{'s' if rest > 1 else ''} changed."
