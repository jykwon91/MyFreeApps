"""A character's professions: the main ones and the secondary ones (Cooking, Fishing, First Aid)."""
from pydantic import BaseModel

from app.schemas.wow.character.character_profession import CharacterProfession


class CharacterProfessions(BaseModel):
    primaries: list[CharacterProfession]
    secondaries: list[CharacterProfession]
