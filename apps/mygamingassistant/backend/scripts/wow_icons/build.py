"""Build the WoW Forever icon map: the client icon of every item / spell the pages show.

    python -m scripts.wow_icons.build

Reads the generated Professions data (run ``scripts.wow_professions.build``
first) and the gathering guides' node items, looks each id up in the Forever
client tables (pinned build, ``scripts/wow_world_map/sources.py``) and writes
``frontend/src/games/wow-forever/data/icons/wowIcons.json``::

    {"source": ..., "build": "1.60.1.70790",
     "items": {"2447": [133939, 1], ...},   # item id -> [icon file id, quality]
     "spells": {"7418": 135913, ...}}       # spell id -> icon file id

The frontend joins names to icons by id; the images themselves are published
by ``python -m scripts.wow_icons.publish`` (never committed). Game data and
icons © Blizzard Entertainment.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_icons.ids import (
    IconIds,
    appearance_icon_map,
    crafting_file_ids,
    icon_file_ids,
    item_icons,
    spell_icons,
)
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD, wago_table

CRAFTING_DIR = WOW_DATA_DIR / "professions" / "crafting"
GATHERING_DIR = WOW_DATA_DIR / "professions" / "gathering"
OUT_FILE = WOW_DATA_DIR / "icons" / "wowIcons.json"
# Hand-written gathering nodes name their item as `itemId: 2447`.
_NODE_ITEM = re.compile(r"\bitemId:\s*(\d+)")
# The comma between two map entries: after `]` (an item) or a digit (a spell), before a quoted id.
_ENTRY_BREAK = re.compile(r'([\]\d]),"(?=\d)')


def gathering_item_ids(directory: Path = GATHERING_DIR) -> set[int]:
    """The herb / ore items the gathering guides' node lists name."""
    ids: set[int] = set()
    for path in sorted(directory.glob("*.ts")):
        ids |= {int(m) for m in _NODE_ITEM.findall(path.read_text(encoding="utf-8"))}
    return ids


def write_icon_map(path: Path, payload: dict[str, Any]) -> None:
    """The map as JSON with one id per line, so a client update's diff shows which icons moved."""
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    text = _ENTRY_BREAK.sub(r'\1,\n"', text)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def wanted_ids() -> IconIds:
    ids = IconIds(items=gathering_item_ids())
    for path in sorted(CRAFTING_DIR.glob("*.json")):
        ids.update(crafting_file_ids(json.loads(path.read_text(encoding="utf-8"))))
    return ids


def main() -> None:
    ids = wanted_ids()
    print(f"Loading icon tables from wago.tools ({WAGO_BRANCH} {WAGO_BUILD})...")
    appearance = appearance_icon_map(wago_table("ItemModifiedAppearance"), wago_table("ItemAppearance"))
    items, missing_items = item_icons(ids.items, wago_table("Item"), wago_table("ItemSparse"), appearance)
    spells, missing_spells = spell_icons(ids.spells, wago_table("SpellMisc"))
    payload = {
        "source": f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD}. Icons © Blizzard Entertainment.",
        "build": WAGO_BUILD,
        "items": {str(k): list(v) for k, v in items.items()},
        "spells": {str(k): v for k, v in spells.items()},
    }
    write_icon_map(OUT_FILE, payload)
    print(
        f"wrote {OUT_FILE.name}: {len(items)} items, {len(spells)} spells, "
        f"{len(icon_file_ids(payload))} distinct icons"
    )
    # A name with no icon gets the frontend's placeholder; say which, so a client change is noticed.
    if missing_items or missing_spells:
        print(f"  no icon: items {missing_items[:20]} spells {missing_spells[:20]}")


if __name__ == "__main__":
    main()
