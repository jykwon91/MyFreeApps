"""Build the Auction house's item categories (potions, herbs, cloth, recipes ...).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_items.categories [--hotfix-cache <DBCache.bin>]

Writes ``frontend/src/games/wow-forever/data/items/itemCategories.json``: for
every item in the Forever client, which item class and subclass it belongs to
(``13446`` Major Healing Potion is ``0.1`` "Potions", ``2447`` Peacebloom is
``7.9`` "Herb"). Only the classes the Auction house offers are kept; weapons
and armor are folded into one ``gear`` key, because the page's Gear filters
already split those by slot and type. Quest and Key items are left out, and so
are subclasses the client marks "(OBSOLETE)" or leaves unnamed, and subclasses
with no items. The rows come from the same tables as ``build.py``.

Item data from the WoW Forever client via wago.tools. Game data © Blizzard
Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import argparse
import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from scripts.wow_items.build import ATTRIBUTION, DATA_DIR, load_subclass_names
from scripts.wow_items.client_ids import ITEM_CLASS_ARMOR, ITEM_CLASS_WEAPON
from scripts.wow_items.forever_items import hotfix_cache_path, load_forever_item_tables
from scripts.wow_items.formula import Row
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD

OUT_PATH = DATA_DIR / "itemCategories.json"

# Consumable, Container, Reagent, Projectile, Trade Goods, Recipe, Quiver, Miscellaneous.
CATEGORY_CLASSES = frozenset({0, 1, 5, 6, 7, 9, 11, 15})
GEAR_CLASSES = frozenset({ITEM_CLASS_WEAPON, ITEM_CLASS_ARMOR})
GEAR_KEY = "gear"
OBSOLETE_MARK = "(OBSOLETE)"


def subclass_key(class_id: int, subclass_id: int) -> str:
    return f"{class_id}.{subclass_id}"


def usable_subclass_names(names: Mapping[tuple[int, int], str]) -> dict[tuple[int, int], str]:
    """The categorised classes' subclasses that have a real, current name."""
    return {
        (class_id, subclass_id): name.strip()
        for (class_id, subclass_id), name in names.items()
        if class_id in CATEGORY_CLASSES and name.strip() and OBSOLETE_MARK not in name
    }


def item_key(item: Row, names: Mapping[tuple[int, int], str]) -> str | None:
    """Where an item is filed; None when the Auction house has no category for it."""
    class_id = int(item["ClassID"])
    if class_id in GEAR_CLASSES:
        return GEAR_KEY
    subclass_id = int(item["SubclassID"])
    return subclass_key(class_id, subclass_id) if (class_id, subclass_id) in names else None


def build_categories(
    item_rows: Mapping[int, Row],
    item_ids: Iterable[int],
    subclass_names: Mapping[tuple[int, int], str],
) -> dict[str, dict[str, Any]]:
    """``subclasses`` (key -> name) and ``items`` (key -> sorted ids) for the items in ``item_ids``.

    A subclass appears only when an item is filed under it.
    """
    names = usable_subclass_names(subclass_names)
    filed: dict[str, list[int]] = {}
    for item_id in sorted(set(item_ids)):
        item = item_rows.get(item_id)
        key = None if item is None else item_key(item, names)
        if key is not None:
            filed.setdefault(key, []).append(item_id)
    label_by_key = {subclass_key(c, s): name for (c, s), name in names.items()}

    def order(key: str) -> tuple[int, int, int]:
        if key == GEAR_KEY:
            return (1, 0, 0)
        class_id, subclass_id = (int(part) for part in key.split("."))
        return (0, class_id, subclass_id)

    keys = sorted(filed, key=order)
    return {
        "subclasses": {key: label_by_key[key] for key in keys if key != GEAR_KEY},
        "items": {key: filed[key] for key in keys},
    }


def _compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def render(header: Mapping[str, str], categories: Mapping[str, Mapping[str, Any]]) -> str:
    """JSON with one subclass and one item list per line, so a refresh diff shows which categories changed."""
    head = _compact(header)[:-1]
    blocks = [
        f'"{name}":{{\n' + ",\n".join(f"{_compact(key)}:{_compact(value)}" for key, value in rows.items()) + "\n}"
        for name, rows in categories.items()
    ]
    return head + ",\n" + ",\n".join(blocks) + "}\n"


def write_categories(path: Path, header: Mapping[str, str], categories: Mapping[str, Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render(header, categories), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the WoW Forever Auction house item categories.")
    parser.add_argument("--hotfix-cache", help="the Forever client's Cache/ADB/enUS/DBCache.bin")
    cache_path = hotfix_cache_path(parser.parse_args().hotfix_cache)
    print(f"Loading item tables from wago.tools ({WAGO_BRANCH} {WAGO_BUILD})...")
    forever = load_forever_item_tables(cache_path)
    named_ids = [int(row["ID"]) for row in forever.sparse]
    categories = build_categories(forever.item, named_ids, load_subclass_names())
    write_categories(
        OUT_PATH,
        {"source": forever.source, "clientBuild": WAGO_BUILD, "attribution": ATTRIBUTION},
        categories,
    )
    filed = sum(len(ids) for ids in categories["items"].values())
    print(f"{filed:,} items in {len(categories['items'])} categories -> {OUT_PATH}")


if __name__ == "__main__":
    main()
