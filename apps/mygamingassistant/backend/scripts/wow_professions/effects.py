"""What a crafted item does, in the Forever client's own tooltip words.

Engineering's route is hard to follow from item names alone ("Gyrochronatom"),
so each recipe carries the use / equip line of the item it makes:
"Inflicts 26 to 34 Fire damage to all enemies in a 5 yard radius." Items with
no such line (bars, tubes, gun stats) get none — the page never fills the gap
with words of its own.
"""
from __future__ import annotations

from scripts.wow_food.tooltip import SpellBook, evaluate


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


def add_effects(recipes: list[dict], book: SpellBook, item_spells: dict[int, list[int]]) -> None:
    """Set ``effect`` on each recipe whose item has one."""
    for rec in recipes:
        creates = rec.get("creates")
        if creates and (text := item_effect(creates["id"], book, item_spells)):
            rec["effect"] = text
