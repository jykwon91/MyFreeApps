"""A character's talents: each saved set, the active one first."""
from pydantic import BaseModel

from app.schemas.wow.character.character_talent_group import CharacterTalentGroup


class CharacterTalents(BaseModel):
    # Empty when the character has spent no points yet.
    groups: list[CharacterTalentGroup]
