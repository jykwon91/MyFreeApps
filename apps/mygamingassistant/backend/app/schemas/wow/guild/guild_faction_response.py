"""A faction the guild's members have met, for the reputation board's faction picker."""
from pydantic import BaseModel


class GuildFactionResponse(BaseModel):
    # Blizzard's faction id.
    id: int
    name: str
    # Live members with a stored standing for it.
    members: int
