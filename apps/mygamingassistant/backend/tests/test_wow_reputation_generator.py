"""The reputation-group build: headers, nested headers, sides and the "Other" factions left out."""
from __future__ import annotations

from typing import Any

from scripts.wow_reputation.factions import faction_groups

ANSWERS: dict[int, dict[str, Any]] = {
    469: {"id": 469, "name": "Alliance", "is_header": True, "player_faction": {"type": "ALLIANCE"},
          "factions": [{"id": 72}, {"id": 47}, {"id": 900}]},
    72: {"id": 72, "name": "Stormwind"},
    47: {"id": 47, "name": "Ironforge"},
    900: {"id": 900, "name": "Alliance Sub", "is_header": True, "factions": [{"id": 901}]},
    901: {"id": 901, "name": "Sub faction"},
    169: {"id": 169, "name": "Steamwheedle Cartel", "is_header": True, "factions": [{"id": 21}]},
    21: {"id": 21, "name": "Booty Bay"},
    529: {"id": 529, "name": "Argent Dawn"},
}


def test_headers_become_groups_and_factions_without_one_are_left_out() -> None:
    index = {"root_factions": [{"id": 529}, {"id": 469}, {"id": 169}]}
    assert faction_groups(index, ANSWERS.__getitem__) == [
        {"id": 169, "name": "Steamwheedle Cartel", "side": None, "factions": [21]},
        {"id": 469, "name": "Alliance", "side": "alliance", "factions": [47, 72]},
        # A header under a header is its own group and keeps its parent's side.
        {"id": 900, "name": "Alliance Sub", "side": "alliance", "factions": [901]},
    ]


def test_an_empty_index_has_no_groups() -> None:
    assert faction_groups({}, ANSWERS.__getitem__) == []
