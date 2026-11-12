"""One saved set of talents (Blizzard's ``specialization_groups`` entry)."""
from pydantic import BaseModel

from app.schemas.wow.character.character_talent_pick import CharacterTalentPick


class CharacterTalentGroup(BaseModel):
    # The set the character had on at their last log out.
    active: bool
    picks: list[CharacterTalentPick]
