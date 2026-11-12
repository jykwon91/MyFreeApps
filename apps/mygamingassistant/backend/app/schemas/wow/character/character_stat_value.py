"""A stat as the character pane shows it: the bare value and the value with gear and buffs."""
from pydantic import BaseModel


class CharacterStatValue(BaseModel):
    base: int
    effective: int
