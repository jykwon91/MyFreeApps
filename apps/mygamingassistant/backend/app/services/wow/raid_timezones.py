"""Timezone lookup for ``/raid-admin setup`` — IANA names plus friendly aliases.

Pure.  ``search`` powers the autocomplete (≤ 25 choices, Discord's cap);
``resolve`` validates whatever the organiser finally submits (they can type a
value without picking a suggestion, so the submitted string is untrusted).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Final
from zoneinfo import available_timezones

MAX_CHOICES: Final = 25

# Friendly name → IANA zone.  Listed first in autocomplete so the common
# North-American/European answers are one tap away.
ALIASES: Final[dict[str, str]] = {
    "Eastern (US)": "America/New_York",
    "Central (US)": "America/Chicago",
    "Mountain (US)": "America/Denver",
    "Arizona (US)": "America/Phoenix",
    "Pacific (US)": "America/Los_Angeles",
    "Alaska (US)": "America/Anchorage",
    "Hawaii (US)": "Pacific/Honolulu",
    "Atlantic (Canada)": "America/Halifax",
    "UK": "Europe/London",
    "Central Europe": "Europe/Berlin",
    "Eastern Europe": "Europe/Helsinki",
    "Australia East": "Australia/Sydney",
    "UTC": "UTC",
}
# Typed shorthands accepted on submit (case-insensitive) without a suggestion.
_SHORTHANDS: Final[dict[str, str]] = {
    "eastern": "America/New_York", "est": "America/New_York", "edt": "America/New_York", "et": "America/New_York",
    "central": "America/Chicago", "cst": "America/Chicago", "cdt": "America/Chicago", "ct": "America/Chicago",
    "mountain": "America/Denver", "mst": "America/Denver", "mdt": "America/Denver", "mt": "America/Denver",
    "pacific": "America/Los_Angeles", "pst": "America/Los_Angeles", "pdt": "America/Los_Angeles",
    "pt": "America/Los_Angeles",
    "utc": "UTC", "gmt": "UTC",
}


@lru_cache(maxsize=1)
def _iana_zones() -> tuple[str, ...]:
    # Skip legacy aliases ("US/Eastern", "EST5EDT") — keep Region/City names.
    return tuple(sorted(z for z in available_timezones() if "/" in z and not z.startswith(("Etc/", "SystemV/", "US/"))))


@lru_cache(maxsize=1)
def _iana_lookup() -> dict[str, str]:
    return {zone.lower(): zone for zone in available_timezones()}


def resolve(value: str) -> str | None:
    """Return the canonical IANA name for ``value`` (IANA, alias or shorthand), else None."""
    cleaned = value.strip()
    if not cleaned:
        return None
    lowered = cleaned.lower()
    for alias, zone in ALIASES.items():
        if alias.lower() == lowered:
            return zone
    if lowered in _SHORTHANDS:
        return _SHORTHANDS[lowered]
    return _iana_lookup().get(lowered)


def search(query: str) -> list[dict[str, str]]:
    """Autocomplete choices ``{"name", "value"}`` matching ``query`` (≤ 25)."""
    needle = query.strip().lower().replace(" ", "_")
    plain_needle = query.strip().lower()
    choices: list[dict[str, str]] = []
    for alias, zone in ALIASES.items():
        if not plain_needle or plain_needle in alias.lower() or plain_needle in zone.lower():
            choices.append({"name": f"{alias} — {zone}", "value": zone})
    seen = {choice["value"] for choice in choices}
    if needle:
        for zone in _iana_zones():
            if len(choices) >= MAX_CHOICES:
                break
            if zone not in seen and needle in zone.lower():
                choices.append({"name": zone, "value": zone})
                seen.add(zone)
    return choices[:MAX_CHOICES]
