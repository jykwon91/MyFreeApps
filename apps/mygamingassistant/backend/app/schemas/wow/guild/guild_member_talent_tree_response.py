"""One talent tree a guild member has points in."""
from pydantic import BaseModel


class GuildMemberTalentTreeResponse(BaseModel):
    """A single talent tree with its Blizzard id and the member's spent point total."""

    tree_id: int
    points: int
