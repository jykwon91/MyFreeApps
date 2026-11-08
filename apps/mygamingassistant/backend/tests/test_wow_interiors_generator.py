"""Tests for the World Map's dungeon interiors generator (``scripts/wow_world_map/interiors.py``).

Which DungeonEncounter rows make a dungeon's boss list, then checks on the
committed ``classicInteriors.json`` and the walk graphs built from it. No network.
"""
from __future__ import annotations

import json

from scripts.wow_world_map.build import CLASSIC_DIR, WALK_DIR
from scripts.wow_world_map.interiors import encounters_by_map


def _enc(encounter: int, map_id: int, difficulty: int, order: int, name: str) -> dict[str, str]:
    return {"ID": str(encounter), "MapID": str(map_id), "DifficultyID": str(difficulty), "OrderIndex": str(order), "Name_lang": f" {name} "}


def _interiors() -> dict[str, dict[str, list]]:
    return json.loads((CLASSIC_DIR / "classicInteriors.json").read_text(encoding="utf-8"))["instances"]


def _dungeon_instances() -> set[int]:
    data = json.loads((CLASSIC_DIR / "classicDungeons.json").read_text(encoding="utf-8"))
    col = data["columns"]
    return {int(r[col.index("instance")]) for r in data["rows"] if r[col.index("type")] == "dungeon"}


def test_a_dungeon_split_across_difficulties_0_and_1_is_one_list_in_order() -> None:
    rows = [
        _enc(4, 90, 0, 4000, "Mekgineer Thermaplugg"),
        _enc(1, 90, 1, 0, "Grubbis"),
        _enc(2, 90, 0, 1000, "Viscous Fallout"),
        # Other modes on the same map: the Season of Discovery raid and friends.
        _enc(9, 90, 198, 4000, "Grubbis"),
        _enc(8, 90, 201, 5000, "Mechanical Menagerie"),
        _enc(7, 90, 215, 0, "Someone Else"),
    ]
    assert encounters_by_map(rows, {90}) == {90: [(1, "Grubbis"), (2, "Viscous Fallout"), (4, "Mekgineer Thermaplugg")]}


def test_only_the_asked_maps_and_negative_orders_sort_first() -> None:
    rows = [_enc(3, 48, 1, 0, "Aku'mai"), _enc(2, 48, 0, -6000, "Ghamoo-ra"), _enc(5, 36, 0, 0, "Elsewhere")]
    assert encounters_by_map(rows, {48}) == {48: [(2, "Ghamoo-ra"), (3, "Aku'mai")]}


def test_every_dungeon_on_the_index_has_bosses() -> None:
    interiors = _interiors()
    missing = sorted(i for i in _dungeon_instances() if not interiors.get(str(i), {}).get("bosses"))
    assert missing == []


def test_gnomeregan_and_blackfathom_have_their_whole_boss_lists() -> None:
    interiors = _interiors()
    gnomeregan = [b[1] for b in interiors["90"]["bosses"]]
    assert gnomeregan == ["Grubbis", "Viscous Fallout", "Electrocutioner 6000", "Crowd Pummeler 9-60", "Mekgineer Thermaplugg"]
    blackfathom = [b[1] for b in interiors["48"]["bosses"]]
    assert blackfathom[0] == "Ghamoo-ra"
    assert blackfathom[-3:] == ["Old Serra'kis", "Twilight Lord Kelris", "Aku'mai"]


def test_every_interior_has_a_walk_graph() -> None:
    missing = sorted(int(m) for m in _interiors() if not (WALK_DIR / f"{m}.walk").is_file())
    assert missing == []
