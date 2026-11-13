"""Build the Forever client's item-name table for auction-house prices.

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_item_names.build [--hotfix-cache <DBCache.bin>]

Writes ``backend/data/wow/item_names.json``: every tradeable item's name from
the Forever client's ``ItemSparse`` (the build pinned in sources.py) plus the
client's hotfix cache, the same rows the Item build reads. Without the cache,
thousands of items the auction house sells (Dreadmist Belt, Underworld Band)
have no name and can't be searched. The price
API (``app/services/wow/prices/client_item_names.py``) names every priced
item from it — Blizzard's auction data carries item ids only.

Game data © Blizzard Entertainment, accessed via wago.tools DB2 export.
"""
from __future__ import annotations

import argparse
import json
from collections.abc import Iterable
from pathlib import Path

from scripts.wow_items.forever_items import hotfix_cache_path, load_forever_item_tables
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD

BACKEND_DIR = Path(__file__).resolve().parents[2]
OUT_PATH = BACKEND_DIR / "data" / "wow" / "item_names.json"

ATTRIBUTION = (
    f"Item names from the WoW Forever client (build {WAGO_BUILD}) via wago.tools DB2 export. "
    "Game data © Blizzard Entertainment."
)

# ItemSparse.Bonding: 1 = binds when picked up, 4 = quest item. Neither can be
# sold at the auction house, so their names would only bloat the file.
UNTRADEABLE_BONDING = frozenset({"1", "4"})


def tradeable_names(rows: Iterable[dict[str, str]]) -> dict[int, str]:
    """``{item id: name}`` for every named item the auction house can list."""
    names: dict[int, str] = {}
    for row in rows:
        name = (row.get("Display_lang") or "").strip()
        raw_id = (row.get("ID") or "").strip()
        if not name or not raw_id.isdigit() or row.get("Bonding") in UNTRADEABLE_BONDING:
            continue
        names[int(raw_id)] = name
    return dict(sorted(names.items()))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the WoW Forever auction-house item names.")
    parser.add_argument("--hotfix-cache", help="the Forever client's Cache/ADB/enUS/DBCache.bin")
    cache_path = hotfix_cache_path(parser.parse_args().hotfix_cache)
    print(f"Loading ItemSparse from wago.tools ({WAGO_BRANCH} {WAGO_BUILD}) and the hotfix cache...")
    names = tradeable_names(load_forever_item_tables(cache_path).sparse)
    payload = {
        "clientBuild": WAGO_BUILD,
        "attribution": ATTRIBUTION,
        "names": {str(item_id): name for item_id, name in names.items()},
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(names)} item names to {OUT_PATH}")


if __name__ == "__main__":
    main()
