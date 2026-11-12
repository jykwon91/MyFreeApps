"""GET /wow/guilds/{slug}/reputations: the factions members have met and everyone's standing with one."""
from pydantic import BaseModel

from app.schemas.wow.guild.guild_faction_response import GuildFactionResponse
from app.schemas.wow.guild.guild_standing_response import GuildStandingResponse


class GuildReputationResponse(BaseModel):
    # The faction ``standings`` are for: the one asked for, else the one most
    # members have met; None when no member has a stored standing.
    faction_id: int | None
    # Most members first, then by name.
    factions: list[GuildFactionResponse]
    # Members who have met ``faction_id``; others have no entry.
    standings: list[GuildStandingResponse]
