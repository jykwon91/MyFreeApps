"""Helpers for free-text postal addresses."""
from __future__ import annotations

import re

_STREET_SEPARATOR = ","
# "... TX 77021" or "... TX 77021-1234" at the end of a one-line address.
_TRAILING_STATE_ZIP = re.compile(r"\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$")


def location_without_street(address: str | None) -> str | None:
    """Where an address is, without its street: city, state and ZIP, or less.

    ``"12 Elm St, Austin, TX 78701"`` → ``"Austin, TX 78701"``. With no comma
    the street can't be told from the city, so only a trailing state and ZIP
    is kept: ``"12 Elm St Austin TX 78701"`` → ``"TX 78701"``. Neither found
    gives None, never the street.
    """
    if not address:
        return None
    if _STREET_SEPARATOR in address:
        rest = address.split(_STREET_SEPARATOR, 1)[1].strip()
        return rest or None
    match = _TRAILING_STATE_ZIP.search(address)
    return f"{match.group(1)} {match.group(2)}" if match else None
