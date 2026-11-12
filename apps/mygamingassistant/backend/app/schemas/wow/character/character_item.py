"""One item the character has equipped, with the stats it actually rolled."""
from pydantic import BaseModel

from app.schemas.wow.character.character_item_stat import CharacterItemStat
from app.schemas.wow.character.character_item_weapon import CharacterItemWeapon


class CharacterItem(BaseModel):
    # Blizzard's slot type: HEAD, NECK, FINGER_1, MAIN_HAND, RANGED, AMMO…
    slot: str
    item_id: int
    name: str
    # poor / common / uncommon / rare / epic / legendary / artifact / heirloom
    quality: str
    item_level: int
    # Blizzard's inventory type: HEAD, TWOHWEAPON, WEAPONMAINHAND, HOLDABLE…
    inventory_type: str
    # "Head", "Two-Hand"…; the tooltip's left line.
    inventory_type_name: str
    # "Cloth", "Staff"…; None when the game hides it (rings, cloaks, trinkets).
    subclass_name: str | None
    binding: str | None
    armor: str | None
    weapon: CharacterItemWeapon | None
    stats: list[CharacterItemStat]
    enchantments: list[str]
    # "Use: …" / "Equip: …" / "Chance on hit: …" lines.
    spells: list[str]
    set_name: str | None
    # "Requires Level 23", "Classes: Warlock".
    requirements: list[str]
    # "Durability 21 / 45"; None for items without durability.
    durability: str | None
    durability_low: bool
    description: str | None
