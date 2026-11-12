"""One profession a character has learned: its skill, rank cap and known recipes."""
from pydantic import BaseModel

from app.schemas.wow.character.character_recipe import CharacterRecipe


class CharacterProfession(BaseModel):
    # Blizzard's profession id: the client's SkillLine id (197 Tailoring, 185 Cooking…).
    id: int
    name: str
    skill: int
    # The current rank's cap (75 / 150 / 225 / 300).
    max_skill: int
    recipes: list[CharacterRecipe]
