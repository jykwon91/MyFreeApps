"""An equipped weapon's damage lines, as the game's tooltip prints them."""
from pydantic import BaseModel


class CharacterItemWeapon(BaseModel):
    damage: str
    speed: str | None
    dps: str | None
