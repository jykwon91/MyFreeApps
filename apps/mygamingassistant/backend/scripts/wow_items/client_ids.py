"""Client enum values the item generator reads, and what they mean on the compare page.

Every mapping here was checked against Forever tooltips: Lionheart Helm (12640)
shows "Increases your critical strike by 28" / "hit by 20" for stats 32 / 31,
so Forever's hit and crit are ratings, not Classic's percentages; Enchanted
Thorium Helm (12620) shows "Increases defense skill by 9" for stat 12; the
school damage ids are Inferno Robe (fire), Radiant Slippers (holy), Stormcloth
Boots (nature), Silky Leggings (frost), Shadow Hood (shadow), Golden Gloves
(arcane).
"""
from __future__ import annotations

# ItemSparse.StatModifier_bonusStat_N -> the compare page's stat key
# (``app/services/wow/stat_keys.py``). Ids missing here are counted as
# "other effects" on the record, never silently dropped.
STAT_KEY_BY_CLIENT_ID: dict[int, str] = {
    0: "mana",
    1: "health",
    3: "agility",
    4: "strength",
    5: "intellect",
    6: "spirit",
    7: "stamina",
    12: "defense",
    13: "dodge_rating",
    14: "parry_rating",
    15: "block_rating",
    31: "hit_rating",
    32: "crit_rating",
    36: "haste_rating",
    37: "expertise_rating",
    38: "attack_power",
    39: "ranged_attack_power",
    41: "healing",
    42: "spell_damage",
    43: "mp5",
    45: "spell_power",
    47: "spell_penetration",
    48: "block_value",
    51: "fire_resistance",
    52: "frost_resistance",
    54: "shadow_resistance",
    55: "nature_resistance",
    56: "arcane_resistance",
    84: "holy_spell_damage",
    85: "fire_spell_damage",
    86: "nature_spell_damage",
    87: "frost_spell_damage",
    88: "shadow_spell_damage",
    89: "arcane_spell_damage",
}

# Extra armor. Its amount is ItemSparse.QualityModifier, which the armor value
# already includes, so it is never a separate stat.
BONUS_ARMOR_STAT_ID = 50

# InventoryType -> budget column of RandPropPoints (``<Quality>F_<n>``): the
# retail item-budget slot groups.
BUDGET_SLOT_BY_INVENTORY_TYPE: dict[int, int] = {
    1: 0, 5: 0, 7: 0, 17: 0, 20: 0,  # head, chest, legs, two-hand, robe
    3: 1, 6: 1, 8: 1, 10: 1, 12: 1,  # shoulder, waist, feet, hands, trinket
    2: 2, 9: 2, 11: 2, 14: 2, 16: 2, 23: 2,  # neck, wrist, finger, shield, back, held in off-hand
    13: 3, 21: 3, 22: 3,  # one-hand, main hand, off hand
    15: 4, 25: 4, 26: 4, 28: 4,  # ranged, thrown, ranged right (gun/crossbow/wand), relic
}

# OverallQualityID -> RandPropPoints column prefix. Legendary uses the epic budget.
BUDGET_QUALITY: dict[int, str] = {2: "Good", 3: "Superior", 4: "Epic", 5: "Epic"}

# InventoryType -> ItemSlot (``app/schemas/wow/extracted_item.py``).
SLOT_BY_INVENTORY_TYPE: dict[int, str] = {
    1: "head", 2: "neck", 3: "shoulder", 4: "shirt", 5: "chest", 6: "waist", 7: "legs",
    8: "feet", 9: "wrist", 10: "hands", 11: "finger", 12: "trinket", 13: "one_hand",
    14: "off_hand", 15: "ranged", 16: "back", 17: "two_hand", 19: "tabard", 20: "chest",
    21: "main_hand", 22: "off_hand", 23: "held_in_off_hand", 25: "thrown", 26: "ranged",
    28: "relic",
}

# OverallQualityID -> ItemQuality.
QUALITY_BY_ID: dict[int, str] = {
    0: "poor", 1: "common", 2: "uncommon", 3: "rare", 4: "epic", 5: "legendary", 6: "artifact", 7: "heirloom",
}

ITEM_CLASS_WEAPON = 2
ITEM_CLASS_ARMOR = 4
ARMOR_SUBCLASS_SHIELD = 6
WEAPON_SUBCLASS_WAND = 19
INVENTORY_TYPE_BACK = 16
INVENTORY_TYPE_CHEST = 5
INVENTORY_TYPE_ROBE = 20

# ItemArmorTotal column + ArmorLocation column per armor subclass.
ARMOR_COLUMNS: dict[int, tuple[str, str]] = {
    1: ("Cloth", "Clothmodifier"),
    2: ("Leather", "Leathermodifier"),
    3: ("Mail", "Chainmodifier"),
    4: ("Plate", "Platemodifier"),
}

# Weapon InventoryType -> ItemDamage table (wands use ItemDamageWand).
DAMAGE_TABLE_BY_INVENTORY_TYPE: dict[int, str] = {
    13: "ItemDamageOneHand", 21: "ItemDamageOneHand", 22: "ItemDamageOneHand",
    17: "ItemDamageTwoHand", 15: "ItemDamageRanged", 26: "ItemDamageRanged",
    25: "ItemDamageThrown",
}
DAMAGE_TABLES = ("ItemDamageOneHand", "ItemDamageTwoHand", "ItemDamageRanged", "ItemDamageWand", "ItemDamageThrown")

# ItemSparse.Flags_4 bit set on caster weapons (Benediction, Sageclaw, Staff of
# Soran'ruk). Their tooltip damage doesn't follow the ItemDamage tables — the
# Forever client's caster tables are copies of the physical ones, and
# Benediction shows 89-155 against the table's 176-264 — so their damage is
# left blank for the player to type in.
CASTER_WEAPON_FLAG = 0x100

# Not every caster weapon carries that flag: Anathema, Grand Marshal's Stave
# and Kris of Unspoken Names also miss the table in Forever (Anathema shows
# 134-222 against 176-264). So a melee weapon with any spell stat is treated
# as a caster weapon too. Wands are unaffected — every wand checked matched.
SPELL_STAT_IDS = frozenset({41, 42, 45, 84, 85, 86, 87, 88, 89})

# Legendary weapons don't all follow the tables either (Thunderfury shows
# 44-115 against 82-153), so their damage is left blank too.
LEGENDARY_QUALITY = 5

# AllowableClass bits -> class ids in ``data/classes.ts``.
CLASS_ID_BY_BIT: dict[int, str] = {
    1: "warrior", 2: "paladin", 4: "hunter", 8: "rogue", 16: "priest",
    64: "shaman", 128: "mage", 256: "warlock", 1024: "druid",
}

# Subclass names that say nothing on the compare page.
UNNAMED_SUBCLASSES = frozenset({"Miscellaneous", "Cosmetic"})
