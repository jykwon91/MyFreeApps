"""Build the Forever client's item-name table for auction-house prices.

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_item_names.build

Writes ``backend/data/wow/item_names.json``: every tradeable item's name from
the Forever client's ``ItemSparse`` (the build pinned in sources.py). The price
API (``app/services/wow/prices/client_item_names.py``) uses it for items
TradeSkillMaster lists with no name — Forever's new items (ids 190000+).

Game data © Blizzard Entertainment, accessed via wago.tools DB2 export.
"""
from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD, wago_table

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
    print(f"Loading ItemSparse from wago.tools ({WAGO_BRANCH} {WAGO_BUILD})...")
    names = tradeable_names(wago_table("ItemSparse"))
    payload = {
        "clientBuild": WAGO_BUILD,
        "attribution": ATTRIBUTION,
        "names": {str(item_id): name for item_id, name in names.items()},
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(names)} item names to {OUT_PATH}")


if __name__ == "__main__":
    main()
