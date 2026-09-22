"""The item reader's enums and the frontend's copies must match.

A stat key the backend can return but the frontend doesn't know would be
silently dropped from scoring; a slot/quality the frontend doesn't know would be
discarded on the way in. Same per-PR contract as enum changes elsewhere: both
sides move together.
"""
from __future__ import annotations

import re
from pathlib import Path

from app.schemas.wow.extracted_item import ITEM_QUALITIES, ITEM_SLOTS
from app.services.wow.stat_keys import STAT_KEYS

WOW_DATA_DIR = (
    Path(__file__).resolve().parents[2] / "frontend/src/games/wow-forever/data"
)


def _ts_const_array(filename: str, const_name: str) -> list[str]:
    source = (WOW_DATA_DIR / filename).read_text(encoding="utf-8")
    block = re.search(rf"export const {const_name} = \[(.*?)\] as const", source, re.S)
    assert block, f"{const_name} array not found in {filename}"
    return re.findall(r'"([a-z0-9_]+)"', block.group(1))


def test_stat_keys_match() -> None:
    assert _ts_const_array("statKeys.ts", "STAT_KEYS") == list(STAT_KEYS)


def test_item_slots_match() -> None:
    assert _ts_const_array("itemSlots.ts", "ITEM_SLOTS") == list(ITEM_SLOTS)


def test_item_qualities_match() -> None:
    assert _ts_const_array("itemSlots.ts", "ITEM_QUALITIES") == list(ITEM_QUALITIES)
