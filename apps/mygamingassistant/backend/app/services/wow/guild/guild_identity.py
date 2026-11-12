"""A guild as Blizzard names it, from a character's profile or the guild's own page."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GuildIdentity:
    blizzard_guild_id: int
    slug: str
    name: str
    # One of ``GUILD_FACTIONS``.
    faction: str
