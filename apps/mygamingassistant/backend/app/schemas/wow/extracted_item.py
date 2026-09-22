"""Response schema for POST /wow/items/extract.

Nothing here is persisted — the item reader turns one tooltip into this shape
and returns it. Scoring happens in the frontend (deterministic stat weights).
"""
from typing import Literal, get_args

from pydantic import BaseModel, Field, model_validator

from app.services.wow.stat_keys import StatKey

ItemQuality = Literal[
    "poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"
]

# Normalized equip slot. ``relic`` covers idols, librams and totems.
ItemSlot = Literal[
    "head", "neck", "shoulder", "back", "chest", "shirt", "tabard", "wrist",
    "hands", "waist", "legs", "feet", "finger", "trinket", "one_hand",
    "main_hand", "off_hand", "held_in_off_hand", "two_hand", "ranged",
    "thrown", "relic", "other",
]

ITEM_QUALITIES: tuple[str, ...] = get_args(ItemQuality)
ITEM_SLOTS: tuple[str, ...] = get_args(ItemSlot)


class ExtractedWeapon(BaseModel):
    min_damage: float = Field(ge=0, le=5000)
    max_damage: float = Field(ge=0, le=5000)
    speed: float = Field(gt=0, le=10)
    dps: float = Field(ge=0, le=2000)

    @model_validator(mode="after")
    def _max_not_below_min(self) -> "ExtractedWeapon":
        if self.max_damage < self.min_damage:
            raise ValueError("max_damage is below min_damage")
        return self


class ExtractedItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quality: ItemQuality | None = None
    slot: ItemSlot | None = None
    item_type: str | None = Field(default=None, max_length=40)
    armor: int | None = Field(default=None, ge=0, le=20000)
    weapon: ExtractedWeapon | None = None
    stats: dict[StatKey, float] = Field(default_factory=dict)
    unparsed_effects: list[str] = Field(default_factory=list, max_length=20)
    required_level: int | None = Field(default=None, ge=1, le=100)
    set_name: str | None = Field(default=None, max_length=120)


class ItemExtractionResponse(BaseModel):
    item: ExtractedItem
    # Things the reader dropped or doubted (unknown stat keys, out-of-range
    # numbers, an invalid weapon block). Shown to the user next to the item so
    # they can correct the stat table before scoring.
    warnings: list[str] = Field(default_factory=list)
