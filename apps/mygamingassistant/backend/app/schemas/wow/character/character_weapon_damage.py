"""One hand's (or the ranged slot's) damage range, swing speed and damage per second."""
from pydantic import BaseModel


class CharacterWeaponDamage(BaseModel):
    min: float
    max: float
    # Seconds per swing; None for the ranged slot, whose speed Blizzard doesn't send.
    speed: float | None
    dps: float | None
