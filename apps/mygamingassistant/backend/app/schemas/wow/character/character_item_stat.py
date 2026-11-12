"""One stat line of an equipped item, as the game's tooltip prints it."""
from pydantic import BaseModel


class CharacterItemStat(BaseModel):
    # "+7 Intellect", "Equip: Increases damage done by Shadow spells by up to 11."
    text: str
    # Green "Equip:" line rather than a white base stat.
    equip_bonus: bool
