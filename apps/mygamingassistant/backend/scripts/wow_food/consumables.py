"""Food and drink that isn't cooked: bought, conjured by a Mage, or dropped.

The cooked foods come from the Cooking recipes (``foods.py``). Everything else
you can eat or drink is an item with the same "Food" / "Drink" use spell, so
this reads it the same way: Forever's own ``ItemSparse`` row (hotfixes and the
client cache applied), its use spell, and the heal / mana that spell gives.

An item is kept only when we can say how to get it:

* **conjured** — a spell named "Conjure Food" / "Conjure Water" creates it
  (the Mage spell's level is the client's ``SpellLevels.BaseLevel``);
* **vendor** — cmangos classic-db lists a vendor that sells it, and the price
  is its ``BuyPrice``;
* **drop** — a mob that is worth farming drops it (not a world drop or a rare).

Items new in Forever have no Classic source data, so they stay out rather than
guessing. A heal or mana amount the client doesn't give (a spell with no
duration) is left out too — Classic Era's duration fills the gap only where the
Forever client has none, and only for the spell's duration.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass

from scripts.wow_food.foods import EFFECT_CREATE_ITEM, _restores
from scripts.wow_food.tooltip import Effect, SpellBook
from scripts.wow_items.forever_items import ForeverTables
from scripts.wow_world_map.sources import WAGO_ERA_BRANCH, WAGO_ERA_BUILD, wago_table

# The Forever client tables this reads, each with the hotfix layers applied.
CONSUMABLE_TABLES = (
    "Item",
    "ItemSparse",
    "ItemEffect",
    "ItemXItemEffect",
    "Spell",
    "SpellName",
    "SpellEffect",
    "SpellMisc",
    "SpellDuration",
    "SpellLevels",
)

# Item class 0 (consumable): subclass 5 = food & drink, 8 = other (field rations, Alterac water).
CONSUMABLE_CLASS = 0
FOOD_SUBCLASSES = frozenset({5, 8})
# Eating and drinking takes 15-30 seconds; a longer effect is an elixir or scroll.
MAX_EAT_SECONDS = 60
MIN_EAT_SECONDS = 10
# A mob must drop it at least this often (percent) to be worth farming for it.
MIN_DROP_CHANCE = 5.0
# Names the client keeps for removed or time-limited copies.
SKIPPED_NAME_PREFIXES = ("Deprecated", "Expiring")
CONJURE_PREFIX = "Conjure "

Row = dict[str, str]


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


@dataclass(frozen=True)
class ConsumableTables:
    """Everything the build reads, by id."""

    item: Mapping[int, Row]
    sparse: Mapping[int, Row]
    item_spells: Mapping[int, list[int]]
    book: SpellBook
    spell_level: Mapping[int, int]


def load_consumable_tables(forever: ForeverTables) -> ConsumableTables:
    book = SpellBook()
    for r in forever.table("SpellName"):
        book.names[_int(r["ID"])] = r["Name_lang"]
    for r in forever.table("Spell"):
        book.descriptions[_int(r["ID"])] = r["Description_lang"]
        book.aura_descriptions[_int(r["ID"])] = r["AuraDescription_lang"]
    durations = {_int(r["ID"]): _int(r["Duration"]) for r in forever.table("SpellDuration")}
    for r in forever.table("SpellMisc"):
        if _int(r["DifficultyID"]) == 0 and (ms := durations.get(_int(r["DurationIndex"]))):
            book.durations_ms.setdefault(_int(r["SpellID"]), ms)
    _fill_missing_durations(book, forever)
    effects: dict[int, list[Effect]] = defaultdict(list)
    for r in forever.table("SpellEffect"):
        if _int(r["DifficultyID"]) != 0:
            continue
        effects[_int(r["SpellID"])].append(
            Effect(
                index=_int(r["EffectIndex"]),
                effect=_int(r["Effect"]),
                aura=_int(r["EffectAura"]),
                base_points=float(r["EffectBasePointsF"] or 0),
                misc=_int(r["EffectMiscValue_0"]),
                period_ms=_int(r["EffectAuraPeriod"]),
                trigger=_int(r["EffectTriggerSpell"]),
                item_type=_int(r["EffectItemType"]),
                variance=float(r.get("Variance") or 0),
            )
        )
    book.effects = dict(effects)
    effect_spell = {_int(r["ID"]): _int(r["SpellID"]) for r in forever.table("ItemEffect")}
    item_spells: dict[int, list[int]] = defaultdict(list)
    for r in sorted(forever.table("ItemXItemEffect"), key=lambda r: _int(r["ID"])):
        if spell := effect_spell.get(_int(r["ItemEffectID"])):
            item_spells[_int(r["ItemID"])].append(spell)
    spell_level = {
        _int(r["SpellID"]): _int(r["BaseLevel"]) for r in forever.table("SpellLevels") if _int(r["DifficultyID"]) == 0
    }
    return ConsumableTables(forever.rows["Item"], forever.rows["ItemSparse"], dict(item_spells), book, spell_level)


def _fill_missing_durations(book: SpellBook, forever: ForeverTables) -> None:
    """A spell the Forever client has no duration for (Conjure Crystal Water's Drink) takes Classic Era's."""
    era_durations = {
        _int(r["ID"]): _int(r["Duration"])
        for r in wago_table("SpellDuration", branch=WAGO_ERA_BRANCH, build=WAGO_ERA_BUILD)
    }
    for r in wago_table("SpellMisc", branch=WAGO_ERA_BRANCH, build=WAGO_ERA_BUILD):
        if _int(r["DifficultyID"]) == 0 and (ms := era_durations.get(_int(r["DurationIndex"]))):
            book.durations_ms.setdefault(_int(r["SpellID"]), ms)


def conjured_items(tables: ConsumableTables) -> dict[int, dict[str, object]]:
    """Item -> the lowest-level Mage "Conjure ..." spell that creates it: {"spell": id, "level": Mage level | None}."""
    out: dict[int, dict[str, object]] = {}
    for spell, effects in tables.book.effects.items():
        if not tables.book.names.get(spell, "").startswith(CONJURE_PREFIX):
            continue
        for e in effects:
            if e.effect != EFFECT_CREATE_ITEM or not e.item_type:
                continue
            level = tables.spell_level.get(spell) or None
            known = out.get(e.item_type)
            if known is None or (level is not None and (known["level"] is None or level < int(str(known["level"])))):
                out[e.item_type] = {"spell": spell, "level": level}
    return out


def _eats(restore: dict | None) -> dict | None:
    """A restore that is a meal: some amount over 10-60 seconds."""
    if restore and restore["amount"] > 0 and MIN_EAT_SECONDS <= restore["seconds"] <= MAX_EAT_SECONDS:
        return restore
    return None


def _drop_worth_farming(drop: dict[str, object] | None) -> bool:
    if not drop or drop.get("world"):
        return False
    return any(float(str(m[3])) >= MIN_DROP_CHANCE for m in drop["mobs"])  # type: ignore[attr-defined]


def build_consumables(tables: ConsumableTables, classic) -> tuple[list[dict], dict[str, dict]]:
    """(records, sources by item id) for every non-cooked food / drink we can say how to get."""
    conjured = conjured_items(tables)
    records: list[dict] = []
    sources: dict[str, dict] = {}
    for item_id in sorted(tables.item_spells):
        row = tables.sparse.get(item_id)
        base = tables.item.get(item_id)
        if row is None or base is None or row["Display_lang"].startswith(SKIPPED_NAME_PREFIXES):
            continue
        if _int(base["ClassID"]) != CONSUMABLE_CLASS or _int(base["SubclassID"]) not in FOOD_SUBCLASSES:
            continue
        if _int(row["MinFactionID"]) or _int(row["MinReputation"]):
            continue
        heal, mana = _restores(tables.book, tables.item_spells[item_id][0])
        heal, mana = _eats(heal), _eats(mana)
        if not heal and not mana:
            continue
        found = classic.reagent_sources(item_id)
        vendors = found.get("vendors") or []
        drop = found.get("drop") if _drop_worth_farming(found.get("drop")) else None  # type: ignore[arg-type]
        conjure = conjured.get(item_id)
        if not (vendors or drop or conjure):
            continue
        records.append({
            "id": item_id,
            "name": row["Display_lang"],
            "level": _int(row["RequiredLevel"]),
            "heal": heal,
            "mana": mana,
            "conjure": conjure,
            "buyCopper": classic.buy_price(item_id) if vendors else None,
        })
        wanted = {k: v for k, v in {"vendors": vendors, "drop": drop}.items() if v}
        sources[str(item_id)] = wanted
    return sorted(records, key=lambda r: (r["level"], r["name"])), sources
