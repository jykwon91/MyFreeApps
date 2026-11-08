"""Tests for the WoW Forever item browser's index generator (``scripts/wow_item_pages/index.py``).

Pure functions over small hand-made rows, then checks on the committed index
against the committed ``items.json`` and Changes feed. No network.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.wow_item_pages.index import (
    CHANGE_KINDS,
    CHANGED_PATH,
    INDEX_COLUMNS,
    INDEX_PATH,
    ITEMS_PATH,
    NEW_PATH,
    NO_TYPE,
    build_index,
    change_ids,
    write_index,
)

ITEM_COLUMNS = ["id", "name", "quality", "slot", "itemType", "itemLevel", "requiredLevel", "armor", "weapon", "stats", "classes", "damageUnknown", "otherEffects"]


def _items_doc(rows: list[list[Any]]) -> dict[str, Any]:
    return {"source": "test", "clientBuild": "1.2.3", "attribution": "Game data © Blizzard Entertainment.", "columns": ITEM_COLUMNS, "items": rows}


def _row(item_id: int, name: str, quality: str, slot: str, item_type: str | None, ilvl: int, req: int) -> list[Any]:
    return [item_id, name, quality, slot, item_type, ilvl, req, None, None, {}, None, 0, 0]


DOC = _items_doc([
    _row(300, "Gamma Ring", "rare", "finger", None, 40, 35),
    _row(100, "Alpha Sword", "epic", "one_hand", "Sword", 60, 55),
    _row(200, "Beta Boots", "uncommon", "feet", "Leather", 20, 15),
])


def test_change_ids_reads_only_item_keys() -> None:
    entries = [{"key": "item:647"}, {"key": "item:12"}, {"key": "spell:5"}, {"name": "no key"}]
    assert change_ids(entries) == {647, 12}


def test_index_keeps_only_list_fields_with_coded_enums() -> None:
    doc = build_index(DOC, changed={200}, new={300})
    assert doc["columns"] == INDEX_COLUMNS
    assert doc["clientBuild"] == "1.2.3"
    # Qualities in the game's order, slots and types alphabetical.
    assert doc["qualities"] == ["uncommon", "rare", "epic"]
    assert doc["slots"] == ["feet", "finger", "one_hand"]
    assert doc["itemTypes"] == ["Leather", "Sword"]
    assert doc["changeKinds"] == CHANGE_KINDS
    # Sorted by id; every row is exactly the index columns.
    assert [r[0] for r in doc["items"]] == [100, 200, 300]
    assert all(len(r) == len(INDEX_COLUMNS) for r in doc["items"])
    assert doc["items"][0] == [100, "Alpha Sword", 2, 2, 1, 60, 55, CHANGE_KINDS.index("none")]
    assert doc["items"][1] == [200, "Beta Boots", 0, 0, 0, 20, 15, CHANGE_KINDS.index("changed")]
    assert doc["items"][2] == [300, "Gamma Ring", 1, 1, NO_TYPE, 40, 35, CHANGE_KINDS.index("new")]


def test_new_wins_over_changed() -> None:
    doc = build_index(DOC, changed={100}, new={100})
    assert doc["items"][0][-1] == CHANGE_KINDS.index("new")


def test_index_never_adds_items_the_list_does_not_have() -> None:
    doc = build_index(DOC, changed={999}, new={998})
    assert [r[0] for r in doc["items"]] == [100, 200, 300]
    assert {r[-1] for r in doc["items"]} == {CHANGE_KINDS.index("none")}


def test_write_index_is_one_item_per_line_and_valid_json(tmp_path: Path) -> None:
    path = tmp_path / "itemIndex.json"
    doc = build_index(DOC, changed=set(), new=set())
    write_index(path, doc)
    text = path.read_text(encoding="utf-8")
    assert json.loads(text) == doc
    # The header line, "items":[ ... one line per item ... ]} and the final newline.
    assert text.count("\n") == len(doc["items"]) + 3


# --- the committed index ------------------------------------------------------------------------------


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def test_committed_index_matches_items_and_changes() -> None:
    index = _load(INDEX_PATH)
    expected = build_index(_load(ITEMS_PATH), change_ids(_load(CHANGED_PATH)["entries"]), change_ids(_load(NEW_PATH)["entries"]))
    assert index == expected, "itemIndex.json is stale — run python -m scripts.wow_item_pages.index"


def test_committed_index_covers_every_item_and_stays_small() -> None:
    index = _load(INDEX_PATH)
    items = _load(ITEMS_PATH)
    assert {r[0] for r in index["items"]} == {r[0] for r in items["items"]}
    # The browser loads this whole file up front; the full item rows are ~1.1 MB.
    assert INDEX_PATH.stat().st_size < 600_000
