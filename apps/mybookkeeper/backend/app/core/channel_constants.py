"""Canonical channel slugs + seed data for the channels reference table.

Per RENTALS_PLAN.md PR 1.4: the four channels seeded at migration time.
Adding a new channel is a follow-up data migration — no code change needed.

The blackouts ``source`` column stores either ``"manual"`` or a channel slug
from this list, so the slugs serve as the inbound-import provenance tag.
"""
from typing import TypedDict


class ChannelSeed(TypedDict):
    id: str
    name: str
    supports_ical_export: bool
    supports_ical_import: bool


# Reserved blackout source for operator-entered blackouts.
BLACKOUT_SOURCE_MANUAL = "manual"

# Initial channel set seeded by the migration. Order is preserved when seeding.
CHANNEL_SEEDS: tuple[ChannelSeed, ...] = (
    {"id": "airbnb", "name": "Airbnb", "supports_ical_export": True, "supports_ical_import": True},
    {"id": "vrbo", "name": "VRBO", "supports_ical_export": True, "supports_ical_import": True},
    {
        "id": "furnished_finder",
        "name": "Furnished Finder",
        # Furnished Finder does not expose an iCal export — verified via
        # FF support docs (2026-05-02). Only iCal import is supported on
        # FF's side, and only from Airbnb / VRBO. So an FF channel link
        # in MBK is record-keeping (External URL) only.
        "supports_ical_export": False,
        "supports_ical_import": False,
    },
    {
        "id": "rotating_room",
        "name": "Rotating Room",
        "supports_ical_export": False,
        "supports_ical_import": False,
    },
)


CHANNEL_IDS: frozenset[str] = frozenset(c["id"] for c in CHANNEL_SEEDS)
