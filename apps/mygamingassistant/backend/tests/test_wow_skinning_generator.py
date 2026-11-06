"""WoW Forever Skinning guide data — the leather-by-mob-level brackets, the
densest-pack pick, and sanity checks on the committed ``classic/skinning.json``
(cmangos ``skinning_loot_template`` + creature levels and spawns).
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pytest

from scripts.wow_food.skinning_sources import MAX_SKIN_LEVEL, MIN_FARM_SPAWNS, SKIN_MOB_COLUMNS, leather_brackets

SKINNING_JSON = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "games" / "wow-forever" / "data" / "professions" / "crafting" / "classic" / "skinning.json"
)


class TestLeatherBrackets:
    def test_neighbouring_levels_with_one_main_leather_merge(self) -> None:
        weights = {
            1: Counter({"Scraps": 9, "Light": 1}),
            2: Counter({"Scraps": 6, "Light": 4}),
            3: Counter({"Light": 6, "Scraps": 4}),
            4: Counter({"Light": 7, "Medium": 3}),
        }
        assert leather_brackets(weights) == [[1, 2, ["Scraps", "Light"]], [3, 4, ["Light", "Scraps", "Medium"]]]

    def test_rare_leathers_are_not_named(self) -> None:
        assert leather_brackets({5: Counter({"Light": 90, "Hide": 10})}) == [[5, 5, ["Light"]]]

    def test_a_missing_level_starts_a_new_bracket(self) -> None:
        weights = {1: Counter({"Light": 1}), 3: Counter({"Light": 1})}
        assert leather_brackets(weights) == [[1, 1, ["Light"]], [3, 3, ["Light"]]]


class TestCommittedSkinning:
    @pytest.fixture(scope="class")
    def data(self) -> dict:
        return json.loads(SKINNING_JSON.read_text(encoding="utf-8"))

    def test_columns_and_mobs(self, data: dict) -> None:
        assert data["mobColumns"] == SKIN_MOB_COLUMNS
        assert len(data["mobs"]) > 300
        for name, lo, hi, spawns, zone, _, x, y, leather in data["mobs"]:
            assert 1 <= lo <= hi <= MAX_SKIN_LEVEL
            assert spawns >= MIN_FARM_SPAWNS
            assert str(zone) in data["zones"] and 0 <= x <= 100 and 0 <= y <= 100
            assert name and leather

    def test_known_beasts(self, data: dict) -> None:
        by_zone = {(m[0], data["zones"][str(m[4])]): m for m in data["mobs"]}
        assert by_zone[("Mottled Boar", "Durotar")][8] == "Ruined Leather Scraps"
        assert by_zone[("Ornery Plainstrider", "The Barrens")][1:3] == [16, 17]
        assert ("Devilsaur", "Un'Goro Crater") not in by_zone  # elite: no solo target

    def test_leather_runs_scraps_to_rugged(self, data: dict) -> None:
        mains = [b[2][0] for b in data["leather"]]
        assert mains == ["Ruined Leather Scraps", "Light Leather", "Medium Leather", "Heavy Leather", "Thick Leather", "Rugged Leather"]
        assert data["leather"][0][0] == 1 and data["leather"][-1][1] == MAX_SKIN_LEVEL
        for a, b in zip(data["leather"], data["leather"][1:]):
            assert b[0] == a[1] + 1  # no gaps

    def test_territory_for_both_starting_sides(self, data: dict) -> None:
        assert set(data["territory"].values()) >= {"alliance", "horde", "contested"}
