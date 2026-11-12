"""A recipe someone in the guild knows, and who."""
from pydantic import BaseModel

from app.schemas.wow.guild.guild_crafter_response import GuildCrafterResponse


class GuildRecipeResponse(BaseModel):
    # Blizzard's recipe id (the client's SkillLineAbility row).
    id: int
    name: str
    # Blizzard's profession id (SkillLine id: 197 Tailoring, 185 Cooking...).
    profession_id: int
    # Highest skill first, then by name.
    crafters: list[GuildCrafterResponse]
