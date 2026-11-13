"""GET /wow/guilds?q=: stored guilds whose name contains the query."""
from pydantic import BaseModel

from app.schemas.wow.guild.guild_summary_response import GuildSummaryResponse


class GuildSearchResponse(BaseModel):
    query: str
    # Biggest first, then by name.
    guilds: list[GuildSummaryResponse]
    # More guilds matched than were sent: type more of the name.
    truncated: bool
