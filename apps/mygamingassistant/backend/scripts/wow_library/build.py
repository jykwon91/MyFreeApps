"""Build the WoW Forever library books page's data (``/wow-forever/library``).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_library.build [--hotfix-cache <DBCache.bin>]

Run after the Items generator (it reads ``items.json`` for reward names) and the
Quest pages generator (it reads ``questSeen.json``, the quests the server has
sent, kept across patches that empty the client's quest cache). The hotfix cache
is the operator's own Forever client file, read and never committed:
``--hotfix-cache`` / ``WOW_FOREVER_HOTFIX_CACHE`` (the item layers, as the Items
build). The run stops when it is missing.

Writes ``data/library/library.json``: the books and library cards from the
Forever client's ItemSparse, and the quests whose title names the Library with
their rewards and the day they were seen. Where the books are found, who takes
them and how many a reward needs are server-side and not in either file.

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import argparse
import json
from typing import Any

from scripts.wow_dungeons.quests import earlier_seen
from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_gear.build import write_json
from scripts.wow_items.forever_items import hotfix_cache_path, load_forever_item_tables
from scripts.wow_library.library import (
    BOOK_COLUMNS,
    CARD_COLUMNS,
    QUEST_COLUMNS,
    library_books,
    library_cards,
    reward_quests,
)
from scripts.wow_quests.build import read_quest_seen

ITEMS_PATH = WOW_DATA_DIR / "items" / "items.json"
LIBRARY_PATH = WOW_DATA_DIR / "library" / "library.json"
ITEM_COLUMNS = ["name", "quality", "slot"]


def reward_item_rows(items_doc: dict[str, Any], wanted: set[int]) -> dict[str, list[Any]]:
    """Item id -> [name, quality, slot] from ``items.json``; a reward it lacks stops the run."""
    columns = items_doc["columns"]
    at = [columns.index(c) for c in ITEM_COLUMNS]
    items = {int(row[0]): row for row in items_doc["items"]}
    missing = sorted(wanted - set(items))
    if missing:
        raise SystemExit(f"Library reward items not in items.json (re-run the Items build first): {missing}")
    return {str(i): [items[i][a] for a in at] for i in sorted(wanted)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the WoW Forever library books page's data.")
    parser.add_argument("--hotfix-cache", help="the Forever client's Cache/ADB/enUS/DBCache.bin")
    args = parser.parse_args()
    tables = load_forever_item_tables(hotfix_cache_path(args.hotfix_cache))
    books = library_books(tables.sparse)
    cards = library_cards(tables.sparse)
    quests = reward_quests(earlier_seen(read_quest_seen()))
    if not books:
        raise SystemExit("No library books in the Forever client's ItemSparse — the description pattern changed?")
    items_doc = json.loads(ITEMS_PATH.read_text(encoding="utf-8"))
    reward_ids = set().union(*(q.item_ids() for q in quests)) if quests else set()
    write_json(LIBRARY_PATH, {
        "source": (
            f"{tables.source}; reward quests from the WoW Forever client's quest cache "
            "(Cache/WDB/enUS/questcache.wdb) on the operator's machine, kept across patches"
        ),
        "attribution": "Game data from the WoW Forever client. © Blizzard Entertainment.",
        "bookColumns": BOOK_COLUMNS,
        "books": [b.as_row() for b in books],
        "cardColumns": CARD_COLUMNS,
        "cards": [c.as_row() for c in cards],
        "questColumns": QUEST_COLUMNS,
        "quests": [q.as_row() for q in quests],
        "itemColumns": ITEM_COLUMNS,
        "items": reward_item_rows(items_doc, reward_ids),
    })
    print(
        f"{len(books)} library books, {len(cards)} library cards, {len(quests)} reward quests -> {LIBRARY_PATH}"
    )


if __name__ == "__main__":
    main()
