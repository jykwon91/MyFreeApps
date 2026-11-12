"""One member on a guild's roster."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GuildRosterMember:
    # None when Blizzard's slug isn't a valid character name: the member keeps
    # its place and rank in the guild but isn't fetched.
    slug: str | None
    blizzard_character_id: int
    # 0 = guild master.
    rank: int
