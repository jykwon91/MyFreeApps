"""Magic resistances, with gear and buffs."""
from pydantic import BaseModel


class CharacterResistances(BaseModel):
    arcane: int
    fire: int
    frost: int
    nature: int
    shadow: int
