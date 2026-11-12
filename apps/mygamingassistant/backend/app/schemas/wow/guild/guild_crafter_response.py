"""A guild member who knows a recipe, with their skill in its profession."""
from pydantic import BaseModel


class GuildCrafterResponse(BaseModel):
    slug: str
    name: str
    surname: str
    # Blizzard's class name ("Warlock"); None when unknown.
    class_name: str | None
    # Their skill in the recipe's profession, from their newest stored professions; None when none is stored.
    skill: int | None
    max_skill: int | None
