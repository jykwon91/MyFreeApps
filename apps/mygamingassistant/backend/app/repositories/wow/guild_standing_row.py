"""A live guild member's standing with one faction, as ``guild_repo.faction_standings`` reads it."""
from __future__ import annotations

from typing import NamedTuple


class GuildStandingRow(NamedTuple):
    slug: str
    tier: int
    value: int
    max: int
