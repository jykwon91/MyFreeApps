"""One guild in GET /wow/guilds?q=: enough to pick it and open its page."""
from pydantic import BaseModel


class GuildSummaryResponse(BaseModel):
    slug: str
    name: str
    # Blizzard's faction type: ALLIANCE or HORDE.
    faction: str
    # From the last roster; None until the first one is in.
    member_count: int | None
