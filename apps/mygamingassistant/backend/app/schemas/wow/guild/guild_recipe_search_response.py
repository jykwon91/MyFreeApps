"""GET /wow/guilds/{slug}/recipes?q=: the guild's known recipes matching a name."""
from pydantic import BaseModel

from app.schemas.wow.guild.guild_recipe_response import GuildRecipeResponse


class GuildRecipeSearchResponse(BaseModel):
    query: str
    # By name.
    recipes: list[GuildRecipeResponse]
    # More recipes matched than were sent: type more of the name.
    truncated: bool
