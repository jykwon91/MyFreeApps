"""A faction live guild members have met, as ``guild_repo.member_factions`` reads it."""
from __future__ import annotations

from typing import NamedTuple


class GuildFactionRow(NamedTuple):
    id: int
    name: str
    # Live members with a standing for it (from each one's newest day that has reputations).
    members: int
