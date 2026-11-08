"""Build the WoW Forever item browser's index (``/wow-forever/items``).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_item_pages.index

Run after the Items and Changes generators: it reads their committed output
(``items.json`` and the Changes feed's ``items.json`` / ``itemsNew.json``).
Needs no network and no client files.

Writes ``data/items/itemIndex.json``: one compact row per item in
``items.json`` — only what the browser lists, filters and sorts on (name,
quality, slot, type, item level, required level and whether the Changes feed
marks it changed or new). Quality, slot and type are written as positions in
the header's lists, so the file stays small. The item pages' shards carry
everything else; the browser never loads them up front.

Every row is Forever client data; nothing is filled from Classic. Game data
© Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

from scripts.wow_food.build import WOW_DATA_DIR

ITEMS_PATH = WOW_DATA_DIR / "items" / "items.json"
INDEX_PATH = WOW_DATA_DIR / "items" / "itemIndex.json"
CHANGES_DIR = WOW_DATA_DIR / "changes"
CHANGED_PATH = CHANGES_DIR / "items.json"
NEW_PATH = CHANGES_DIR / "itemsNew.json"

INDEX_COLUMNS = ["id", "name", "quality", "slot", "itemType", "itemLevel", "requiredLevel", "change"]
# The ``change`` column: a position in this list (the Changes feed's row kinds).
CHANGE_KINDS = ["none", "changed", "new"]
# The game's quality order, as the frontend's ``ITEM_QUALITIES``.
QUALITY_ORDER = ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"]
ITEM_KEY_PREFIX = "item:"
NO_TYPE = -1


def change_ids(entries: Iterable[Mapping[str, Any]]) -> set[int]:
    """Item ids of a Changes feed shard's ``item:<id>`` rows."""
    return {int(e["key"][len(ITEM_KEY_PREFIX):]) for e in entries if str(e.get("key", "")).startswith(ITEM_KEY_PREFIX)}


def _ordered(values: set[str], order: Sequence[str]) -> list[str]:
    """The known values in ``order`` first, then any others alphabetically."""
    known = [v for v in order if v in values]
    return known + sorted(values - set(order))


def build_index(
    items_doc: Mapping[str, Any],
    changed: set[int],
    new: set[int],
) -> dict[str, Any]:
    """The index document for ``items_doc`` (``items.json``), marking the Changes feed's changed / new ids."""
    columns: list[str] = items_doc["columns"]
    col = {name: columns.index(name) for name in ("id", "name", "quality", "slot", "itemType", "itemLevel", "requiredLevel")}
    rows = items_doc["items"]
    qualities = _ordered({r[col["quality"]] for r in rows}, QUALITY_ORDER)
    slots = sorted({r[col["slot"]] for r in rows})
    types = sorted({r[col["itemType"]] for r in rows if r[col["itemType"]] is not None})
    q_pos = {v: i for i, v in enumerate(qualities)}
    s_pos = {v: i for i, v in enumerate(slots)}
    t_pos = {v: i for i, v in enumerate(types)}

    def change(item_id: int) -> int:
        if item_id in new:
            return CHANGE_KINDS.index("new")
        if item_id in changed:
            return CHANGE_KINDS.index("changed")
        return CHANGE_KINDS.index("none")

    out = [
        [
            r[col["id"]],
            r[col["name"]],
            q_pos[r[col["quality"]]],
            s_pos[r[col["slot"]]],
            NO_TYPE if r[col["itemType"]] is None else t_pos[r[col["itemType"]]],
            r[col["itemLevel"]],
            r[col["requiredLevel"]],
            change(r[col["id"]]),
        ]
        for r in sorted(rows, key=lambda r: r[col["id"]])
    ]
    return {
        "source": items_doc["source"],
        "clientBuild": items_doc["clientBuild"],
        "attribution": items_doc["attribution"],
        "columns": INDEX_COLUMNS,
        "qualities": qualities,
        "slots": slots,
        "itemTypes": types,
        "changeKinds": CHANGE_KINDS,
        "items": out,
    }


def write_index(path: Path, doc: Mapping[str, Any]) -> None:
    """The header on one line, then one item per line, so a refresh diff names the items that changed."""
    def dumps(value: object) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    head = ",".join(f"{dumps(k)}:{dumps(v)}" for k, v in doc.items() if k != "items")
    rows = ",\n".join(dumps(r) for r in doc["items"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{{{head},\n\"items\":[\n{rows}\n]}}\n", encoding="utf-8")


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    items_doc = _load(ITEMS_PATH)
    changed = change_ids(_load(CHANGED_PATH)["entries"])
    new = change_ids(_load(NEW_PATH)["entries"])
    doc = build_index(items_doc, changed, new)
    write_index(INDEX_PATH, doc)
    kinds = [row[-1] for row in doc["items"]]
    print(
        f"{len(doc['items']):,} items ({kinds.count(1):,} changed, {kinds.count(2):,} new in Forever) "
        f"-> {INDEX_PATH} ({INDEX_PATH.stat().st_size:,} bytes)"
    )


if __name__ == "__main__":
    main()
