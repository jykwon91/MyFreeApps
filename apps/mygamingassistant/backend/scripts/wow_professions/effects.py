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

# The game's own words on every camp object it lets a profession make (Mana Well, Spinning Wheel, ...).
CAMP_MARKER = "Requires a Campfire nearby."
# A camp object's buff grows with the player's level; the guide shows the level-60 numbers.
CAMP_EFFECT_LEVEL = 60
# ``$?$PL<24[10]?$PL<34[15][29]``: the first branch whose player-level test holds, else the last.
_LEVEL_TEST = re.compile(r"\$PL([<>])(\d+)\[([^\[\]]*)\]")
_LEVEL_ELSE = re.compile(r"\[([^\[\]]*)\]")


def resolve_level_branches(text: str, level: int) -> str:
    """``text`` with each ``$?$PL<N[a]?$PL>M[b][c]`` chain replaced by its branch for ``level``.

    A chain that doesn't parse is left as it is, so the caller's ``$`` check still drops it.
    """
    out: list[str] = []
    i = 0
    while (start := text.find("$?", i)) != -1:
        out.append(text[i:start])
        pos, chosen = start + 2, None
        while (test := _LEVEL_TEST.match(text, pos)) is not None:
            op, bound, branch = test.group(1), int(test.group(2)), test.group(3)
            holds = level < bound if op == "<" else level > bound
            if chosen is None and holds:
                chosen = branch
            pos = test.end()
            if not text.startswith("?", pos):
                break
            pos += 1
        fallback = _LEVEL_ELSE.match(text, pos) if pos > start + 2 else None
        if fallback is None:
            out.append(text[start:start + 2])
            i = start + 2
            continue
        out.append(chosen if chosen is not None else fallback.group(1))
        i = fallback.end()
    out.append(text[i:])
    return "".join(out)


def item_effect(item: int, book: SpellBook, item_spells: dict[int, list[int]], level: int | None = None) -> str | None:
    """The first of ``item``'s spells whose tooltip reads cleanly; None when none does.

    A tooltip that is blank or keeps a token the evaluator can't fill
    (``$d`` on a spell with no duration) is skipped rather than shown half-read.
    ``level`` picks the player-level branches (``$?$PL<24[...]``) for that level.
    """
    for spell in item_spells.get(item, []):
        text = evaluate(book, spell)
        if text and level is not None:
            text = resolve_level_branches(text, level)
        if text and "$" not in text:
            return " ".join(text.split())
    return None


def mark_camp_objects(recipes: list[dict], book: SpellBook, item_spells: dict[int, list[int]]) -> None:
    """Mark each recipe that makes a camp object, with its level-60 tooltip as ``effect``.

    A camp object whose tooltip doesn't read cleanly fails the build rather than
    dropping out of the guide unnoticed.
    """
    for rec in recipes:
        creates = rec.get("creates")
        if not creates:
            continue
        spells = item_spells.get(creates["id"], [])
        if not any(CAMP_MARKER in (book.descriptions.get(s) or "") for s in spells):
            continue
        text = item_effect(creates["id"], book, item_spells, CAMP_EFFECT_LEVEL)
        if not text or CAMP_MARKER not in text:
            raise ValueError(f"Camp object {rec['name']!r} (item {creates['id']}): tooltip doesn't read cleanly: {text!r}")
        rec["camp"] = True
        rec["effect"] = text


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
