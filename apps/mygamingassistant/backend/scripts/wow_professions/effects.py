"""What a crafted item does, in the Forever client's own tooltip words.

Engineering's route is hard to follow from item names alone ("Gyrochronatom"),
so each recipe carries the use / equip line of the item it makes:
"Inflicts 26 to 34 Fire damage to all enemies in a 5 yard radius." Items with
no such line (bars, tubes, gun stats) get none — the page never fills the gap
with words of its own.
"""
from __future__ import annotations

import re

from scripts.wow_food.tooltip import SpellBook, evaluate
from scripts.wow_professions.crafts import EFFECT_ENCHANT_ITEM
from scripts.wow_world_map.sources import wago_table

# ``$ec1`` in an enchant's tooltip: point N of the SpellItemEnchantment the spell applies.
ENCHANT_POINT_TOKEN = re.compile(r"\$ec([1-3])")


def item_effect(item: int, book: SpellBook, item_spells: dict[int, list[int]]) -> str | None:
    """The first of ``item``'s spells whose tooltip reads cleanly; None when none does.

    A tooltip that is blank or keeps a token the evaluator can't fill
    (``$d`` on a spell with no duration) is skipped rather than shown half-read.
    """
    for spell in item_spells.get(item, []):
        text = evaluate(book, spell)
        if text and "$" not in text:
            return text
    return None


def load_enchant_points() -> dict[int, list[int]]:
    """Each enchanting spell's SpellItemEnchantment points (``EffectPointsMin_0..2``), for ``$ecN``."""
    points = {
        int(r["ID"]): [int(float(r[f"EffectPointsMin_{i}"] or 0)) for i in range(3)]
        for r in wago_table("SpellItemEnchantment")
    }
    by_spell: dict[int, list[int]] = {}
    for r in wago_table("SpellEffect"):
        if r["DifficultyID"] == "0" and int(r["Effect"] or 0) == EFFECT_ENCHANT_ITEM:
            if (row := points.get(int(r["EffectMiscValue_0"] or 0))) is not None:
                by_spell.setdefault(int(r["SpellID"]), row)
    return by_spell


def enchant_effect(spell: int, book: SpellBook, enchant_points: dict[int, list[int]]) -> str | None:
    """An enchant's own spell tooltip ("Permanently enchant ... by 9."); None when it doesn't read cleanly."""
    text = evaluate(book, spell)
    if text and (row := enchant_points.get(spell)):
        text = ENCHANT_POINT_TOKEN.sub(lambda m: str(row[int(m.group(1)) - 1]), text)
    return text if text and "$" not in text else None


def add_effects(
    recipes: list[dict], book: SpellBook, item_spells: dict[int, list[int]], enchant_points: dict[int, list[int]],
) -> None:
    """Set ``effect`` on each recipe whose item has one, and on each enchant from its own spell."""
    for rec in recipes:
        creates = rec.get("creates")
        if creates and (text := item_effect(creates["id"], book, item_spells)):
            rec["effect"] = text
        elif rec.get("enchant") and (text := enchant_effect(rec["spell"], book, enchant_points)):
            rec["effect"] = text
