"""Build the WoW Forever Legacy planner's data (``/wow-forever/legacy``).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_legacy.build [--hotfix-cache <DBCache.bin>]

Reads the Forever client's Trait*, achievement and renown tables (wago.tools
``wowf`` + hotfixes + the operator's ``DBCache.bin``, like the talent build)
and writes ``data/legacy/legacy.json``: the three Legacy trees (nodes, grid
positions, gates, links, each talent's text), the point cap, the challenges
that earn points grouped by achievement category, and the account rank's
rewards. The run stops when a table no longer matches what the planner
assumes (the tree names, one talent per node, the point cost, the rank cap).

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import argparse
from collections import OrderedDict
from typing import Any

from scripts.wow_changes.spells import full_text
from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_gear.build import write_json
from scripts.wow_items.forever_items import hotfix_cache_path, load_forever_tables
from scripts.wow_legacy.legacy import (
    RANK_CURRENCY_ID,
    Challenge,
    build_trees,
    challenges,
    point_cost,
    rank_cap,
    rank_rewards,
)
from scripts.wow_talents.books import FOREVER_BOOK_TABLES, forever_book, forever_icons

LEGACY_PATH = WOW_DATA_DIR / "legacy" / "legacy.json"
LEGACY_TABLES = (
    "TraitTree",
    "TraitCurrency",
    "TraitCost",
    "TraitNode",
    "TraitNodeEntry",
    "TraitDefinition",
    "TraitCond",
    "TraitEdge",
    "TraitNodeXTraitNodeEntry",
    "TraitCurrencySource",
    "TraitTreeXTraitCurrency",
    "TraitNodeGroupXTraitNode",
    "TraitNodeGroupXTraitCond",
    "RenownRewards",
    "CurrencyTypes",
    "Achievement",
    "Achievement_Category",
)


def category_docs(found: list[Challenge]) -> list[dict[str, Any]]:
    """Challenges as categories → groups (sub-categories, None when the category has none), order kept."""
    categories: OrderedDict[str, OrderedDict[str | None, list[dict[str, object]]]] = OrderedDict()
    for c in found:
        doc = c.as_doc()
        doc.pop("category")
        doc.pop("group")
        categories.setdefault(c.category, OrderedDict()).setdefault(c.group, []).append(doc)
    return [
        {"name": name, "groups": [{"name": group, "challenges": rows} for group, rows in groups.items()]}
        for name, groups in categories.items()
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the WoW Forever Legacy planner's data.")
    parser.add_argument("--hotfix-cache", help="the Forever client's Cache/ADB/enUS/DBCache.bin")
    args = parser.parse_args()
    tables = load_forever_tables(hotfix_cache_path(args.hotfix_cache), (*FOREVER_BOOK_TABLES, *LEGACY_TABLES))
    book = forever_book({t: tables.table(t) for t in FOREVER_BOOK_TABLES})
    icons = forever_icons(tables.table("SpellMisc"))
    trees, currency = build_trees(
        {t: tables.table(t) for t in LEGACY_TABLES},
        book.names,
        icons,
        lambda spell: full_text(book, spell),
    )
    currency_row = tables.rows["TraitCurrency"].get(currency)
    if currency_row is None:
        raise SystemExit(f"TraitCurrency {currency} (the Legacy points) is missing.")
    cap = int(currency_row["SourcedMax"])
    found = challenges(
        tables.table("TraitCurrencySource"),
        tables.rows["Achievement"],
        tables.rows["Achievement_Category"],
        currency,
    )
    if not found:
        raise SystemExit("No Legacy challenges in TraitCurrencySource.")
    rewards = rank_rewards(tables.table("RenownRewards"))
    write_json(LEGACY_PATH, {
        "source": tables.source(),
        "build": tables.cache_build,
        "attribution": "Game data from the WoW Forever client. © Blizzard Entertainment.",
        "currency": {"id": currency, "cap": cap, "icon": int(currency_row["Icon"])},
        "pointCost": point_cost(tables.rows["TraitCost"], currency),
        "trees": [t.as_doc() for t in trees],
        "categories": category_docs(found),
        "rank": {
            "currency": RANK_CURRENCY_ID,
            "max": rank_cap(tables.rows["CurrencyTypes"]),
            "rewards": [r.as_doc() for r in rewards],
        },
    })
    print(
        f"Legacy: {len(trees)} trees, {sum(len(t.nodes) for t in trees)} nodes, cap {cap}, "
        f"{len(found)} challenges, {len(rewards)} rank rewards -> {LEGACY_PATH}"
    )


if __name__ == "__main__":
    main()
