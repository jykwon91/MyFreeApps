"""Forever-client facts for the item pages: crafted-by, bind, vendor price.

Pure functions over the generated crafting JSON and the Forever ItemSparse
rows; tested in ``tests/test_wow_item_pages_generator.py``.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from typing import Any

from scripts.wow_item_pages.loot_chances import as_int

Row = Mapping[str, Any]

CRAFTED_COLUMNS = ["profession", "skill", "spell", "recipe", "reagents", "learn", "learnItem"]
# The most recipes listed for one item (several professions / ranks can make it).
MAX_RECIPES = 4


def crafted_by(docs: Mapping[str, Mapping[str, Any]], wanted: set[int]) -> dict[int, list[list[Any]]]:
    """Item id -> CRAFTED_COLUMNS rows, lowest skill first, from each profession's ``crafting/<key>.json``.

    ``docs`` is keyed by the profession key the Professions page takes in ``?p=``.
    """
    rows: dict[int, list[list[Any]]] = defaultdict(list)
    for key in sorted(docs):
        for recipe in docs[key].get("recipes", []):
            creates = recipe.get("creates")
            if not creates or as_int(creates["id"]) not in wanted:
                continue
            learn = recipe.get("learn") or {}
            skill = as_int(learn.get("skill")) or as_int(recipe.get("yellow"))
            reagents = [[as_int(r["id"]), as_int(r["count"]), str(r["name"])] for r in recipe.get("reagents", [])]
            rows[as_int(creates["id"])].append([
                key, skill, as_int(recipe["spell"]), str(recipe["name"]), reagents,
                str(learn.get("source") or ""), str(learn.get("item") or ""),
            ])
    return {item: sorted(found, key=lambda r: (r[1], r[0], r[2]))[:MAX_RECIPES] for item, found in rows.items()}


def item_facts(sparse_rows: Iterable[Row], wanted: set[int]) -> dict[int, dict[str, int]]:
    """Item id -> {"bind": ItemSparse.Bonding, "buy": BuyPrice in copper} (zeros left out)."""
    facts: dict[int, dict[str, int]] = {}
    for row in sparse_rows:
        item_id = as_int(row["ID"])
        if item_id not in wanted:
            continue
        fact = {"bind": as_int(row.get("Bonding")), "buy": as_int(row.get("BuyPrice"))}
        facts[item_id] = {k: v for k, v in fact.items() if v}
    return facts
