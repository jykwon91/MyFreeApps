"""MGA Loot's item-level budget (``scripts/wow_loot/budget.py``): the estimate for effects the data can't value."""
from __future__ import annotations

import json
from functools import cache
from typing import Any

from scripts.wow_loot.budget import MIN_SAMPLE, SLOT_GROUPS, Budget, Sample, stat_points
from scripts.wow_loot.effect_model import BUDGET, UNRESOLVED
from scripts.wow_loot.item_effects import OUT

UNCOMMON, RARE, EPIC, LEGENDARY = 2, 3, 4, 5
CHEST_COLUMN, SHOULDER_COLUMN = 0, 1


def _rand_prop_points(per_level: float) -> dict[int, dict[str, str]]:
    """A budget that grows ``per_level`` a level for every quality and slot column (columns 0-4)."""
    return {
        level: {f"{quality}F_{column}": str(level * per_level) for quality in ("Good", "Superior", "Epic") for column in range(5)}
        for level in range(1, 101)
    }


def _samples(group: str, quality: int, column: int, points_by_level: dict[int, int]) -> list[Sample]:
    return [Sample(group, quality, level, column, points) for level, points in points_by_level.items()]


def test_stat_points_leave_out_mana_health_and_extra_armor() -> None:
    # 3 strength (4), 7 stamina (7), 50 mana (0), 40 health (1), 60 extra armor (50).
    assert stat_points({4: 3, 7: 7, 0: 50, 1: 40, 50: 60}) == 10


def test_a_full_cell_is_the_median_of_its_items() -> None:
    samples = [Sample("head_chest_legs", RARE, 50, CHEST_COLUMN, p) for p in (20, 30, 40, 50, 90)]
    assert Budget(samples, _rand_prop_points(1)).points("head_chest_legs", RARE, 50) == 40


def test_a_thin_cell_widens_and_scales_neighbours_to_its_level() -> None:
    # One item a level at 40, 45, 50, 55 and 60, each exactly on a budget of 1 point a level.
    samples = _samples("head_chest_legs", RARE, CHEST_COLUMN, {level: level for level in (40, 45, 50, 55, 60)})
    budget = Budget(samples, _rand_prop_points(2))
    # The window reaches all five; each counts at level 50's budget, so every one reads 50.
    assert budget.points("head_chest_legs", RARE, 50) == 50
    assert budget.points("head_chest_legs", RARE, 60) == 60


def test_a_slot_group_with_too_few_items_borrows_its_budget_column() -> None:
    # No trinkets at all: trinkets share column 1 with shoulders, hands, feet and waist.
    shoulders = _samples("shoulder_hands_feet_waist", EPIC, SHOULDER_COLUMN, {60: 30, 61: 31, 62: 32, 63: 33, 64: 34})
    budget = Budget(shoulders, _rand_prop_points(1))
    assert budget.points("trinket", EPIC, 62) == budget.points("shoulder_hands_feet_waist", EPIC, 62) == 32


def test_legendaries_use_the_epic_budget_and_common_items_have_none() -> None:
    epics = _samples("two_hand", EPIC, CHEST_COLUMN, {70: 70, 71: 71, 72: 72, 73: 73, 74: 74})
    budget = Budget(epics, _rand_prop_points(1))
    assert budget.points("two_hand", LEGENDARY, 72) == 72
    assert budget.points("two_hand", 1, 72) is None


def test_the_table_has_every_level_for_every_group_it_can_price() -> None:
    samples = _samples("head_chest_legs", UNCOMMON, CHEST_COLUMN, {level: level for level in range(10, 10 + MIN_SAMPLE)})
    table = Budget(samples, _rand_prop_points(1)).table()
    assert list(table["head_chest_legs"][UNCOMMON]) == list(range(1, 101))
    # Only the groups on the chest's budget column (two-handers) can borrow these; the rest have no items.
    assert set(table) == {"head_chest_legs", "two_hand"}


# --- The committed data ----------------------------------------------------------------------


@cache
def _committed() -> dict[str, Any]:
    return json.loads(OUT.read_text(encoding="utf-8"))


def _budget(group: str, quality: int, level: int) -> int:
    return _committed()["budget"][group][str(quality)][str(level)]


def test_committed_table_covers_every_slot_group_at_every_level() -> None:
    table = _committed()["budget"]
    assert set(table) == set(SLOT_GROUPS.values())
    for group, by_quality in table.items():
        assert set(by_quality) == {"2", "3", "4", "5"}, group
        for quality, levels in by_quality.items():
            assert list(levels) == [str(level) for level in range(1, len(levels) + 1)], (group, quality)
    assert _committed()["minBudgetSample"] == MIN_SAMPLE


def test_committed_budget_grows_with_quality_and_level() -> None:
    for group in SLOT_GROUPS.values():
        assert _budget(group, UNCOMMON, 60) <= _budget(group, RARE, 60) <= _budget(group, EPIC, 60), group
        assert _budget(group, EPIC, 20) < _budget(group, EPIC, 60), group
    # A two-hander carries about twice a one-hander's stats.
    assert _budget("two_hand", EPIC, 60) > 1.5 * _budget("one_hand", EPIC, 60)


def test_committed_unresolved_items_carry_an_estimate() -> None:
    for item_id, entries in _committed()["items"].items():
        stats = [e["stat"] for e in entries]
        assert (UNRESOLVED in stats) == (BUDGET in stats), item_id
        for entry in entries:
            if entry["stat"] == BUDGET:
                assert entry["value"] >= 0, item_id
                assert entry["note"].startswith("effect estimated from item level: "), item_id


def test_committed_estimates_on_known_items() -> None:
    items = _committed()["items"]
    # Shortsword of Vengeance: Holy Smite has no proc rate, so its level pays for it.
    assert items["754"][-1] == {"stat": BUDGET, "value": 14, "note": "effect estimated from item level: worth ~14 stat points"}
    # Galgann's Firehammer: the same for its Firebolt.
    assert items["9419"][-1]["value"] == 14
    # Zum'rah's Vexing Cane's summon is modelled, so it gets no estimate.
    assert BUDGET not in [e["stat"] for e in items["18082"]]
