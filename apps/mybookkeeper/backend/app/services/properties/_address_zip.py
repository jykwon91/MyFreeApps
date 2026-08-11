"""Derive a US ZIP code from a free-text property address.

The ZIP lives inside ``properties.address`` already. Copying it into its own
column would store the same fact twice and let the two drift, so it is read
back out on demand instead.
"""
from __future__ import annotations

import re

# Anchored to the end of the string because a US address puts the ZIP last.
# ZIP+4 is accepted and truncated — the offer feed keys on the 5-digit form.
# Searching anywhere in the string would happily match a house number.
_TRAILING_ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\s*$")


def derive_zip_code(address: str | None) -> str | None:
    """Return the 5-digit ZIP at the end of ``address``, or None."""
    if not address:
        return None
    match = _TRAILING_ZIP_RE.search(address.strip())
    return match.group(1) if match else None
