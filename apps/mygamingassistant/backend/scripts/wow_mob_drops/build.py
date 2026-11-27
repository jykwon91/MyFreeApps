"""Build the MGA Drops addon's data: what each creature drops and how often.

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_mob_drops.build [--hotfix-cache <DBCache.bin>]

Reads cmangos classic-db (the pinned dump in ``scripts/wow_world_map/sources.py``:
``creature_template``, ``creature_loot_template``, ``reference_loot_template``,
``conditions``) and the Forever client's Item/ItemSparse with hotfixes, the
same rows the Item build reads (names, quality, and which items Forever has at
all). Writes ``frontend/addon/MGADrops/Data.lua``. Drop chances are Classic's
(GPL-3.0, the addon folder carries the LICENSE); Forever may differ. Never
hand-edit the output.
"""
from __future__ import annotations

import argparse
from collections.abc import Iterable
from pathlib import Path

from scripts.wow_item_pages.loot_chances import as_int, loot_index, world_pools
from scripts.wow_items.forever_items import hotfix_cache_path, load_forever_item_tables
from scripts.wow_mob_drops.data_lua import data_lua
from scripts.wow_mob_drops.mob_drops import creature_lists
from scripts.wow_world_map.sources import CMANGOS_COMMIT, WAGO_BUILD, cmangos_dump
from scripts.wow_world_map.sql_dump import read_dump

BACKEND_DIR = Path(__file__).resolve().parents[2]
ADDON_DIR = BACKEND_DIR.parent / "frontend" / "addon" / "MGADrops"
DATA_PATH = ADDON_DIR / "Data.lua"
CMANGOS_TABLES = {"creature_template", "creature_loot_template", "reference_loot_template", "conditions"}


def forever_items(sparse: Iterable[dict[str, str]]) -> dict[int, tuple[str, int]]:
    """Item id -> (name, quality) for every named item the Forever client has."""
    out: dict[int, tuple[str, int]] = {}
    for row in sparse:
        name = (row.get("Display_lang") or "").strip()
        item = as_int(row.get("ID"))
        if name and item > 0:
            out[item] = (name, as_int(row.get("OverallQualityID")))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the MGA Drops addon's Data.lua.")
    parser.add_argument("--hotfix-cache", help="the Forever client's Cache/ADB/enUS/DBCache.bin")
    cache_path = hotfix_cache_path(parser.parse_args().hotfix_cache)
    items = forever_items(load_forever_item_tables(cache_path).sparse)
    tables = read_dump(cmangos_dump(), CMANGOS_TABLES)
    creature_loot = loot_index(tables["creature_loot_template"])
    references = loot_index(tables["reference_loot_template"])
    creatures, lists = creature_lists(
        tables["creature_template"], creature_loot, references, tables["conditions"],
        world_pools(creature_loot), items,
    )
    text = data_lua(creatures, lists, items, build=WAGO_BUILD, classic_db=CMANGOS_COMMIT)
    DATA_PATH.write_text(text, encoding="utf-8", newline="\n")
    print(f"{len(creatures):,} creatures, {len(lists):,} distinct loot lists, {len(text.encode()) / 1024:,.0f} KB -> {DATA_PATH}")


if __name__ == "__main__":
    main()
