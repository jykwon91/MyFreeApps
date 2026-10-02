"""WoW Forever gold-farm generator — loot-table expected values, and sanity
checks on the committed data it produced.

Loot rules (cmangos): groupid 0 rolls on its own; a group rolls once, chance-0
entries sharing what explicit chances leave; a reference rolls its chance and
then runs the referenced table ``maxcount`` times; negative chance = quest item.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_gold.farms import FARM_COLUMNS, LootTables

GOLD_DATA = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "games" / "wow-forever" / "data" / "gold" / "classic"
)


def _item(entry: int, sell: int, *, klass: int = 15, quality: int = 0, name: str = "Junk") -> dict:
    return {"entry": entry, "SellPrice": sell, "class": klass, "Quality": quality, "name": name}


def _row(entry: int, item: int, chance: float, *, group: int = 0, min_or_ref: int = 1, maxcount: int = 1) -> dict:
    return {
        "entry": entry, "item": item, "ChanceOrQuestChance": chance, "groupid": group,
        "mincountOrRef": min_or_ref, "maxcount": maxcount, "condition_id": 0,
    }


ITEMS = {
    1: _item(1, 100),
    2: _item(2, 40),
    3: _item(3, 20),
    4: _item(4, 25, klass=7, name="Runecloth"),
    5: _item(5, 500, klass=4, quality=2),
}


def test_independent_rows_weigh_by_chance_and_quest_items_are_skipped() -> None:
    loot = LootTables([_row(10, 1, 50), _row(10, 2, -100)], None, ITEMS)
    assert loot.haul(10).vendor == pytest.approx(50)


def test_a_group_rolls_once_with_chance_zero_entries_sharing_the_rest() -> None:
    # Item 1 at 20%; items 2 and 3 split the other 80% -> 40% each.
    loot = LootTables([_row(10, 1, 20, group=1), _row(10, 2, 0, group=1), _row(10, 3, 0, group=1)], None, ITEMS)
    assert loot.haul(10).vendor == pytest.approx(0.2 * 100 + 0.4 * 40 + 0.4 * 20)


def test_a_reference_runs_its_table_maxcount_times() -> None:
    refs = LootTables([_row(900, 5, 10), _row(900, 4, 50, min_or_ref=1, maxcount=3)], None, ITEMS)
    loot = LootTables([_row(10, 0, 100, min_or_ref=-900, maxcount=2)], refs, ITEMS)
    haul = loot.haul(10)
    assert haul.greens == pytest.approx(2 * 0.1)
    # Runecloth: 50% for 1-3 (2 on average), twice.
    assert haul.cloth == {4: pytest.approx(2 * 0.5 * 2)}
    assert haul.vendor == pytest.approx(2 * (0.1 * 500 + 0.5 * 2 * 25))


@pytest.fixture(scope="module")
def farms() -> list[dict]:
    data = json.loads((GOLD_DATA / "goldFarms.json").read_text(encoding="utf-8"))
    assert data["columns"] == FARM_COLUMNS
    return [{**dict(zip(data["columns"], row)), "zoneName": data["zones"][str(row[5])]} for row in data["farms"]]


def test_every_level_has_farm_spots(farms: list[dict]) -> None:
    for level in range(5, 61):
        fits = [f for f in farms if f["maxLevel"] >= level - 3 and f["minLevel"] <= level + 1]
        assert len({(f["zone"], f["subzone"]) for f in fits}) >= 3, level


def test_spots_are_ordinary_camps_outside_capitals(farms: list[dict]) -> None:
    capitals = {"Stormwind City", "Ironforge", "Darnassus", "Orgrimmar", "Thunder Bluff", "Undercity"}
    for f in farms:
        assert f["zoneName"] not in capitals
        assert f["maxLevel"] - f["minLevel"] <= 6
        assert f["pack"] >= 6
        assert 0 < f["killsPerHour"] <= 60
        assert not f["name"].startswith("Timbermaw")


def test_known_classic_camps_are_listed(farms: list[dict]) -> None:
    names = {f["name"] for f in farms}
    # Runecloth humanoids (Silithus Twilight, Winterspring furbolgs) and the Plaguelands' bats.
    assert {"Twilight Geolord", "Winterfall Ursa", "Monstrous Plaguebat"} <= names
    runecloth = next(f for f in farms if f["name"] == "Twilight Geolord")
    assert runecloth["cloth"] == "Runecloth"
    assert runecloth["clothPerKill"] > 0.5
