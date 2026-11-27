"""Scrub identifiers out of free text a person typed before it leaves the app."""
from __future__ import annotations

import re

# Four or more digits in a row: an account tail ("...4821"), a street number, a policy number.
_LONG_NUMBER = re.compile(r"\d{4,}")
_EXTRA_SPACE = re.compile(r"\s{2,}")


def without_long_numbers(text: str | None) -> str | None:
    """``text`` with every run of 4+ digits removed; None when nothing is left."""
    if text is None:
        return None
    cleaned = _EXTRA_SPACE.sub(" ", _LONG_NUMBER.sub("", text)).strip(" -–·.#")
    return cleaned or None
