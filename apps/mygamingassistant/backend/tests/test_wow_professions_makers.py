"""WoW Forever crafting generator — `makers`: how another profession makes a
reagent, so the guides can price an item nobody sells yet from its materials.

Committed values are the Forever client's (1.60.1.70790): Golden Rod is a
Gold Bar and 2 Coarse Grinding Stones; a Coarse Grinding Stone is 2 Coarse Stone.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_professions.build import maker_records

CRAFTING_DATA = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "games" / "wow-forever" / "data" / "professions" / "crafting"
)

ORE, BAR, STONE, GRINDER, ROD = 1, 2, 3, 4, 5


def _recipe(spell: int, creates: int, reagents: dict[int, int], yellow: int = 50, count: int = 1) -> dict:
    return {
        "spell": spell, "yellow": yellow,
        "reagents": [{"id": i, "name": str(i), "count": n} for i, n in reagents.items()],
        "creates": {"id": creates, "name": str(creates), "count": count, "quality": 1},
    }


class TestMakerRecords:
    RECIPES = [
        _recipe(10, BAR, {ORE: 1}),
        _recipe(11, GRINDER, {STONE: 2}),
        _recipe(12, ROD, {BAR: 1, GRINDER: 2}),
        {"spell": 13, "yellow": 1, "reagents": [{"id": ORE, "name": "", "count": 1}]},  # an enchant: makes no item
    ]

    def test_follows_the_reagents_down(self) -> None:
        out = maker_records({ROD}, self.RECIPES)
        assert list(out) == [str(BAR), str(GRINDER), str(ROD)]
        assert out[str(ROD)] == {"count": 1, "reagents": self.RECIPES[2]["reagents"]}

    def test_raw_items_have_no_maker(self) -> None:
        assert maker_records({ORE, STONE}, self.RECIPES) == {}

    def test_the_recipe_learned_first_wins(self) -> None:
        later = _recipe(20, BAR, {STONE: 9}, yellow=200)
        out = maker_records({BAR}, [later, *self.RECIPES])
        assert out[str(BAR)]["reagents"] == self.RECIPES[0]["reagents"]

    def test_an_item_made_from_itself_stops(self) -> None:
        loop = [_recipe(30, BAR, {ROD: 1}), _recipe(31, ROD, {BAR: 1})]
        assert set(maker_records({ROD}, loop)) == {str(BAR), str(ROD)}

    def test_keeps_the_count_made(self) -> None:
        out = maker_records({BAR}, [_recipe(40, BAR, {ORE: 1}, count=3)])
        assert out[str(BAR)]["count"] == 3


@pytest.fixture(scope="module")
def enchanting() -> dict:
    return json.loads((CRAFTING_DATA / "enchanting.json").read_text(encoding="utf-8"))


class TestCommittedMakers:
    def test_golden_rod_is_made_from_a_gold_bar(self, enchanting: dict) -> None:
        rod = enchanting["makers"]["11128"]
        assert sorted((r["name"], r["count"]) for r in rod["reagents"]) == [("Coarse Grinding Stone", 2), ("Gold Bar", 1)]
        assert [(r["name"], r["count"]) for r in enchanting["makers"]["3478"]["reagents"]] == [("Coarse Stone", 2)]

    def test_own_crafts_only_where_another_maker_needs_them(self, enchanting: dict) -> None:
        makers = enchanting["makers"]
        own = {str(r["creates"]["id"]) for r in enchanting["recipes"] if r.get("creates")}
        needed = {str(r["id"]) for m in makers.values() for r in m["reagents"]}
        assert own & set(makers) == {"12655"}  # Enchanted Thorium Bar, for Engineering's 234003
        assert own & set(makers) <= needed
