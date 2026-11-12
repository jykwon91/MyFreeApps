"""A stored WoW Forever guild and its members, as the guild page shows it."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.wow.guild.guild_member_response import GuildMemberResponse


class GuildResponse(BaseModel):
    slug: str
    name: str
    # alliance / horde
    faction: str
    # Members on Blizzard's roster at the last refresh; None before the first.
    roster_size: int | None
    roster_updated_at: datetime | None
    # The last roster refresh failed; the members shown are from roster_updated_at.
    refresh_failed: bool
    # Blizzard no longer has this guild.
    gone: bool
    # The gains boards' window: each member's baseline is their newest stored
    # day at least this many days old (else their earliest).
    gains_window_days: int
    members: list[GuildMemberResponse]
