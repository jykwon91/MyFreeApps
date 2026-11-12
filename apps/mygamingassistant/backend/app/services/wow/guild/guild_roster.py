"""A guild's roster as read from Blizzard: the members we could read, out of how many."""
from __future__ import annotations

from dataclasses import dataclass

from app.services.wow.guild.guild_roster_member import GuildRosterMember


@dataclass(frozen=True)
class GuildRoster:
    members: list[GuildRosterMember]
    # Every entry Blizzard listed, readable or not.
    listed: int
