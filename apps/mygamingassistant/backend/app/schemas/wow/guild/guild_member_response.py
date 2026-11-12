"""One stored member of a guild, for the guild page's member list."""
from datetime import datetime

from pydantic import BaseModel


class GuildMemberResponse(BaseModel):
    slug: str
    name: str
    surname: str
    # Blizzard's class name ("Warlock"); None when the stored sheet has none.
    class_name: str | None
    level: int | None
    item_level: int | None
    # 0 = guild master; None until the roster refresh has ranked the member.
    rank: int | None
    # When the member's character was last fetched from Blizzard.
    refreshed_at: datetime
