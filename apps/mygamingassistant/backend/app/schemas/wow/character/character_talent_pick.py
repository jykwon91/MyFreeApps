"""One talent a character has points in."""
from pydantic import BaseModel


class CharacterTalentPick(BaseModel):
    # Blizzard's talent id: the same ids as MGA's talent tree files.
    id: int
    rank: int
