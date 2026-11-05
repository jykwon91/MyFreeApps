"""How the Forever client turns an ItemSparse row into the numbers on its tooltip.

ItemSparse carries no stat amounts, armor or damage — only percentages and
pointers into budget tables. The client works the tooltip out like this:

* **Stat** = ``RandPropPoints[ItemLevel].<Quality>F_<slot> × StatPercentEditor / 10000``,
  rounded half up. ``<Quality>`` is Good / Superior / Epic, ``<slot>`` is the
  item-budget slot group of the InventoryType (``client_ids``).
* **Armor** = ``ItemArmorTotal[ItemLevel].<material> × ArmorLocation[InventoryType].<material>modifier
  × ItemArmorQuality[ItemLevel].Qualitymod_<quality>``, rounded half up (cloaks
  count as cloth, robes as chest); shields read ``ItemArmorShield``. Extra
  armor (``QualityModifier``) is added on top, as the tooltip does.
* **Weapon damage**: DPS = ``ItemDamage<kind>[ItemLevel].Quality_<quality>``,
  average hit = DPS × ``ItemDelay`` / 1000, min = ⌊avg × (1 − DmgVariance/2)⌋,
  max = avg × (1 + DmgVariance/2) rounded half up. Caster weapons and
  legendaries don't follow the tables (``client_ids``), so they get none.

Checked against the Classic values of every item the two clients share (see
``tests/test_wow_items_generator.py``) and against Forever tooltips.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from scripts.wow_items.client_ids import (
    ARMOR_COLUMNS,
    ARMOR_SUBCLASS_SHIELD,
    BONUS_ARMOR_STAT_ID,
    BUDGET_QUALITY,
    BUDGET_SLOT_BY_INVENTORY_TYPE,
    CASTER_WEAPON_FLAG,
    DAMAGE_TABLE_BY_INVENTORY_TYPE,
    INVENTORY_TYPE_BACK,
    INVENTORY_TYPE_CHEST,
    INVENTORY_TYPE_ROBE,
    ITEM_CLASS_ARMOR,
    ITEM_CLASS_WEAPON,
    LEGENDARY_QUALITY,
    SPELL_STAT_IDS,
    WEAPON_SUBCLASS_WAND,
)

Row = dict[str, str]
STAT_COLUMNS = 10
CLOTH_SUBCLASS = 1


@dataclass(frozen=True)
class BudgetTables:
    """The client's budget tables, each keyed by item level."""

    rand_prop_points: dict[int, Row]
    armor_quality: dict[int, Row]
    armor_shield: dict[int, Row]
    armor_total: dict[int, Row]
    armor_location: dict[int, Row]
    damage: dict[str, dict[int, Row]]


@dataclass(frozen=True)
class WeaponDamage:
    min_damage: int
    max_damage: int
    speed: float


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def round_half_up(value: float) -> int:
    return math.floor(value + 0.5)


def stat_lines(sparse: Row) -> list[tuple[int, int]]:
    """``(client stat id, StatPercentEditor)`` for every stat the row has."""
    lines = []
    for i in range(STAT_COLUMNS):
        stat_id = _int(sparse.get(f"StatModifier_bonusStat_{i}"))
        percent = _int(sparse.get(f"StatPercentEditor_{i}"))
        if stat_id >= 0 and percent != 0:
            lines.append((stat_id, percent))
    return lines


def stat_budget(sparse: Row, tables: BudgetTables) -> float | None:
    """The stat budget the row's percentages are of; None when the client has none for it."""
    quality = BUDGET_QUALITY.get(_int(sparse["OverallQualityID"]))
    slot = BUDGET_SLOT_BY_INVENTORY_TYPE.get(_int(sparse["InventoryType"]))
    row = tables.rand_prop_points.get(_int(sparse["ItemLevel"]))
    if quality is None or slot is None or row is None:
        return None
    return float(row[f"{quality}F_{slot}"])


def stat_values(sparse: Row, tables: BudgetTables) -> dict[int, int] | None:
    """Client stat id → tooltip amount. None when the row has stats but no budget to price them."""
    lines = [(s, p) for s, p in stat_lines(sparse) if s != BONUS_ARMOR_STAT_ID]
    if not lines:
        return {}
    budget = stat_budget(sparse, tables)
    if budget is None:
        return None
    values: dict[int, int] = {}
    for stat_id, percent in lines:
        amount = round_half_up(budget * percent / 10000)
        if amount != 0:
            values[stat_id] = values.get(stat_id, 0) + amount
    return values


def armor_value(sparse: Row, item: Row, tables: BudgetTables) -> int | None:
    """Total armor on the tooltip (base + extra armor); None for non-armor items."""
    if _int(item["ClassID"]) != ITEM_CLASS_ARMOR:
        return None
    level = _int(sparse["ItemLevel"])
    quality = _int(sparse["OverallQualityID"])
    inventory_type = _int(sparse["InventoryType"])
    subclass = _int(item["SubclassID"])
    bonus = _int(sparse.get("QualityModifier"))
    if subclass == ARMOR_SUBCLASS_SHIELD:
        shield = tables.armor_shield.get(level)
        return None if shield is None else _int(shield[f"Quality_{quality}"]) + bonus
    if inventory_type == INVENTORY_TYPE_BACK:
        subclass = CLOTH_SUBCLASS
    if inventory_type == INVENTORY_TYPE_ROBE:
        inventory_type = INVENTORY_TYPE_CHEST
    columns = ARMOR_COLUMNS.get(subclass)
    total = tables.armor_total.get(level)
    quality_mod = tables.armor_quality.get(level)
    location = tables.armor_location.get(inventory_type)
    if columns is None or total is None or quality_mod is None or location is None:
        return bonus or None
    total_column, location_column = columns
    base = float(total[total_column]) * float(location[location_column]) * float(quality_mod[f"Qualitymod_{quality}"])
    armor = round_half_up(base) + bonus
    return armor or None


def is_wand(item: Row) -> bool:
    return _int(item["ClassID"]) == ITEM_CLASS_WEAPON and _int(item["SubclassID"]) == WEAPON_SUBCLASS_WAND


def damage_reproducible(sparse: Row, item: Row) -> bool:
    """False for the weapons whose tooltip damage the client tables are known not to give."""
    if _int(sparse.get("Flags_4")) & CASTER_WEAPON_FLAG or _int(sparse["OverallQualityID"]) == LEGENDARY_QUALITY:
        return False
    return is_wand(item) or not any(s in SPELL_STAT_IDS for s, _ in stat_lines(sparse))


def damage_table(sparse: Row, item: Row) -> str | None:
    if _int(item["ClassID"]) != ITEM_CLASS_WEAPON:
        return None
    if is_wand(item):
        return "ItemDamageWand"
    return DAMAGE_TABLE_BY_INVENTORY_TYPE.get(_int(sparse["InventoryType"]))


def weapon_damage(sparse: Row, item: Row, tables: BudgetTables) -> WeaponDamage | None:
    """Damage range + speed. None for non-weapons and weapons the tables don't reproduce."""
    table = damage_table(sparse, item)
    if table is None or not damage_reproducible(sparse, item):
        return None
    row = tables.damage[table].get(_int(sparse["ItemLevel"]))
    delay_ms = _int(sparse.get("ItemDelay"))
    if row is None or delay_ms <= 0:
        return None
    dps = float(row[f"Quality_{_int(sparse['OverallQualityID'])}"])
    average = dps * delay_ms / 1000
    variance = float(sparse.get("DmgVariance") or 0)
    low = math.floor(average * (1 - variance / 2))
    high = round_half_up(average * (1 + variance / 2))
    if high <= 0:
        return None
    return WeaponDamage(min_damage=low, max_damage=high, speed=delay_ms / 1000)
