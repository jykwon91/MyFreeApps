"""A recipe (or enchant, or profession spell) a character knows."""
from pydantic import BaseModel


class CharacterRecipe(BaseModel):
    # Blizzard's recipe id: the recipe's spell id, the same ids as MGA's crafting files.
    id: int
    name: str
