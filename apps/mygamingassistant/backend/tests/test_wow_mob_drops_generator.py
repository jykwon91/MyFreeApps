"""The MGA Drops addon's data: cmangos loot rolls worked out by hand, then the per-creature lists and Data.lua."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from scripts.wow_item_pages.loot_chances import WORLD_DROP, any_drop_chance, loot_index, table_chances, table_drops
from scripts.wow_mob_drops.build import DATA_PATH, forever_items
from scripts.wow_mob_drops.data_lua import data_lua, drop_lua
from scripts.wow_mob_drops.mob_drops import (
    ALLIANCE,
    HORDE,
    MIN_PERCENT,
    NOTE_HOLIDAY,
    NOTE_QUEST,
    NOTE_SPECIAL,
    Creature,
    Drop,
    LootList,
    condition_note,
    creature_lists,
    for_team,
    percent,
    team_conditions,
)

ALLIANCE_ONLY = 1
HORDE_ONLY = 2
NEEDS_BLACKSMITHING = 3
HOLIDAY = 4
COMBINED = 5
CONDITIONS = [
    {"condition_entry": ALLIANCE_ONLY, "type": 6, "value1": 469, "value2": 0},
    {"condition_entry": HORDE_ONLY, "type": 6, "value1": 67, "value2": 0},
    {"condition_entry": NEEDS_BLACKSMITHING, "type": 7, "value1": 164, "value2": 1},
    {"condition_entry": HOLIDAY, "type": 26, "value1": 141, "value2": 0},
    {"condition_entry": COMBINED, "type": -1, "value1": 1, "value2": 3},
]


def _loot(
    entry: int, item: int, chance: float, group: int = 0, ref: int = 1, maxcount: int = 1, condition: int = 0,
) -> dict[str, Any]:
    return {
        "entry": entry, "item": item, "ChanceOrQuestChance": chance, "groupid": group,
        "mincountOrRef": ref, "maxcount": maxcount, "condition_id": condition,
    }


def _template(npc: int, name: str, loot: int, levels: tuple[int, int] = (10, 11)) -> dict[str, Any]:
    return {"Entry": npc, "Name": name, "MinLevel": levels[0], "MaxLevel": levels[1], "LootId": loot}


# --- the rolls (loot_chances) ------------------------------------------------------------------------------


def test_a_quest_drop_in_a_group_takes_its_share_of_the_roll_and_is_marked() -> None:
    # The quest row rolls 40% whether or not anyone is on the quest; the two equal rows split the other 60%.
    rows = [_loot(1, 10, -40.0, group=1), _loot(1, 11, 0, group=1), _loot(1, 12, 0, group=1)]
    drops = table_drops(rows, {})
    assert drops[(10, True, 0)] == pytest.approx(0.40)
    assert drops[(11, False, 0)] == pytest.approx(0.30)
    assert drops[(12, False, 0)] == pytest.approx(0.30)
    assert table_chances(rows, {}) == {11: pytest.approx(0.30), 12: pytest.approx(0.30)}


def test_a_group_past_100_percent_is_averaged_over_the_shuffled_order() -> None:
    # 95% and 17.5%: half the time the 95% row goes first (95%), half the time it gets what the
    # 17.5% row leaves (82.5%), so 88.75%; the 17.5% row gets 17.5% or the 5% left: 11.25%.
    rows = [_loot(1, 20, 95.0, group=1), _loot(1, 21, 17.5, group=1), _loot(1, 22, 0, group=1)]
    chances = table_chances(rows, {})
    assert chances[20] == pytest.approx(0.8875)
    assert chances[21] == pytest.approx(0.1125)
    assert 22 not in chances  # nothing is left over for an equal-chance row
    assert sum(chances.values()) == pytest.approx(1.0)


def test_three_sure_references_in_one_group_give_one_of_them() -> None:
    # Azuregos' group 1: three 100% references; the first one the shuffle reaches is the one given.
    references = {50: [_loot(50, 30, 100.0)], 51: [_loot(51, 31, 100.0)], 52: [_loot(52, 32, 100.0)]}
    rows = [_loot(1, 0, 100.0, group=1, ref=-ref) for ref in (50, 51, 52)]
    chances = table_chances(rows, references)
    assert chances == {30: pytest.approx(1 / 3), 31: pytest.approx(1 / 3), 32: pytest.approx(1 / 3)}


def test_a_reference_rolls_its_chance_once_then_runs_maxcount_times() -> None:
    references = {50: [_loot(50, 40, 50.0)]}
    # 50% to roll the reference, then two runs at 50% each: 0.5 * (1 - 0.5²).
    assert table_chances([_loot(1, 0, 50.0, ref=-50, maxcount=2)], references)[40] == pytest.approx(0.375)


def test_a_reference_in_a_group_is_one_of_its_rows() -> None:
    references = {50: [_loot(50, 41, 50.0)]}
    # The 60% item takes its share; the chance-0 reference gets the 40% left, then gives its item half the time.
    rows = [_loot(1, 42, 60.0, group=1), _loot(1, 0, 0, group=1, ref=-50)]
    chances = table_chances(rows, references)
    assert chances[42] == pytest.approx(0.60)
    assert chances[41] == pytest.approx(0.20)


def test_rows_the_server_drops_at_load_never_drop() -> None:
    references = {50: [_loot(50, 43, 100.0)]}
    rows = [
        _loot(1, 44, 50.0, ref=0),  # mincountOrRef 0
        _loot(1, 0, -50.0, ref=-50),  # a reference with a quest chance
        _loot(1, 45, 0),  # chance 0 outside a group
    ]
    assert table_drops(rows, references) == {}


def test_a_skipped_world_pool_comes_back_as_one_any_drop_chance() -> None:
    references = {90: [_loot(90, 60, 50.0), _loot(90, 61, 50.0)]}
    # The pool gives something 75% of the time (either of two 50% rows), rolled at 20%.
    assert any_drop_chance(references[90], references) == pytest.approx(0.75)
    drops = table_drops([_loot(1, 0, 20.0, ref=-90), _loot(1, 62, 5.0)], references, {90})
    assert drops == {WORLD_DROP: pytest.approx(0.15), (62, False, 0): pytest.approx(0.05)}


def test_any_drop_chance_counts_a_group_once_and_leaves_quest_drops_out() -> None:
    rows = [_loot(1, 70, 30.0, group=1), _loot(1, 71, 20.0, group=1), _loot(1, 72, -90.0)]
    assert any_drop_chance(rows, {}) == pytest.approx(0.50)


# --- conditions and factions -------------------------------------------------------------------------------


def test_team_conditions_and_notes() -> None:
    assert team_conditions(CONDITIONS) == {ALLIANCE_ONLY: ALLIANCE, HORDE_ONLY: HORDE}
    by_id = {c["condition_entry"]: c for c in CONDITIONS}
    assert condition_note(by_id[ALLIANCE_ONLY]) is None
    assert condition_note(by_id[NEEDS_BLACKSMITHING]) == "Blacksmithing"
    assert condition_note(by_id[HOLIDAY]) == NOTE_HOLIDAY
    assert condition_note(by_id[COMBINED]) == NOTE_SPECIAL
    assert condition_note(None) is None


def test_a_row_for_the_other_faction_takes_no_share_of_its_group() -> None:
    # Totem of Rage (Horde) and Libram of Truth (Alliance) share a group's leftover with one more row.
    index = loot_index([
        _loot(1, 80, 0, group=1, condition=HORDE_ONLY),
        _loot(1, 81, 0, group=1, condition=ALLIANCE_ONLY),
        _loot(1, 82, 0, group=1),
    ])
    teams = team_conditions(CONDITIONS)
    horde = table_chances(for_team(index, teams, HORDE)[1], {})
    alliance = table_chances(for_team(index, teams, ALLIANCE)[1], {})
    assert horde == {80: pytest.approx(0.5), 82: pytest.approx(0.5)}
    assert alliance == {81: pytest.approx(0.5), 82: pytest.approx(0.5)}


# --- creature lists ----------------------------------------------------------------------------------------


ITEMS = {100: ("Linen Cloth", 1), 101: ("Wolf Heart", 1), 102: ("Plans: Blade", 2), 103: ("Unsent Letter", 1), 104: ("Winter Hat", 1)}


def test_creature_lists_split_factions_note_conditions_and_share_identical_lists() -> None:
    creature_loot = loot_index([
        _loot(1, 100, 25.0),
        _loot(1, 101, -60.0),
        _loot(1, 102, 2.0, condition=NEEDS_BLACKSMITHING),
        _loot(1, 103, 10.0, condition=ALLIANCE_ONLY),
        _loot(1, 104, 100.0, condition=HOLIDAY),
        _loot(1, 999, 50.0),  # not in the Forever client: left out
        _loot(1, 100, MIN_PERCENT / 2, group=0),  # adds to Linen Cloth's chance, not a row of its own
        _loot(2, 101, MIN_PERCENT / 2),  # under the cut: nothing to show
    ])
    templates = [_template(10, "Gnoll", 1), _template(11, "Gnoll Brute", 1), _template(12, "Rabbit", 2), _template(13, "Ghost", 0)]
    creatures, lists = creature_lists(templates, creature_loot, {}, CONDITIONS, set(), ITEMS)
    assert creatures == [Creature(10, "Gnoll", 10, 11, 0), Creature(11, "Gnoll Brute", 10, 11, 0)]
    linen = 100 * (1 - 0.75 * (1 - MIN_PERCENT / 200))
    assert lists == [LootList((
        Drop(104, 100.0, 100.0, NOTE_HOLIDAY),
        Drop(101, 60.0, 60.0, NOTE_QUEST),
        Drop(100, round(linen, 1), round(linen, 1), None),
        Drop(103, 10.0, 0.0, None),
        Drop(102, 2.0, 2.0, "Blacksmithing"),
    ), 0.0)]


def test_a_creature_with_only_world_drops_keeps_the_world_line() -> None:
    creature_loot = loot_index([_loot(1, 0, 20.0, ref=-90)])
    references = loot_index([_loot(90, 100, 50.0)])
    creatures, lists = creature_lists([_template(10, "Murloc", 1)], creature_loot, references, [], {90}, ITEMS)
    assert [c.npc for c in creatures] == [10]
    assert lists == [LootList((), 10.0)]


def test_percent_rounds_to_one_decimal_from_1_percent_and_two_below() -> None:
    assert percent(0.12345) == 12.3
    assert percent(0.0061234) == 0.61
    assert percent(1.0) == 100.0


def test_forever_items_reads_name_and_quality() -> None:
    rows = [{"ID": "2589", "Display_lang": "Linen Cloth", "OverallQualityID": "1"}, {"ID": "5", "Display_lang": " "}]
    assert forever_items(rows) == {2589: ("Linen Cloth", 1)}


# --- Data.lua ----------------------------------------------------------------------------------------------


def test_drop_lua_writes_the_horde_percent_only_when_it_differs() -> None:
    assert drop_lua(Drop(1, 25.0, 25.0, None)) == "{1, 25}"
    assert drop_lua(Drop(1, 2.5, 2.5, NOTE_QUEST)) == '{1, 2.5, "quest"}'
    assert drop_lua(Drop(1, 10.0, 0.0, None)) == "{1, 10, nil, 0}"


def test_data_lua_lists_used_items_and_one_based_list_indexes() -> None:
    lists = [LootList((Drop(100, 25.0, 25.0, None),), 12.5)]
    text = data_lua([Creature(10, 'Gnoll "Boss"', 10, 11, 0)], lists, ITEMS, build="1.60.1.1", classic_db="abc")
    assert 'build = "1.60.1.1", classicDb = "abc",' in text
    assert '    [100] = {"Linen Cloth", 1},' in text
    assert "[101]" not in text
    assert "    {w = 12.5, {100, 25}}," in text
    assert '    [10] = {"Gnoll \\"Boss\\"", 10, 11, 1},' in text
    assert "GPL-3.0" in text and "Forever may differ" in text


def test_committed_data_lua_has_hogger_with_his_alliance_only_letter() -> None:
    text = DATA_PATH.read_text(encoding="utf-8")
    hogger = re.search(r'^    \[448\] = \{"Hogger", 11, 11, (\d+)\},$', text, re.MULTILINE)
    assert hogger is not None
    lists = text[text.index("  lists = {\n"):text.index("  npcs = {\n")].splitlines()[1:]
    row = lists[int(hogger.group(1)) - 1]
    assert "{1931, 100, \"quest\"}" in row  # Huge Gnoll Claw, for the quest
    assert "{1307, 2, nil, 0}" in row  # Gold Pickup Schedule: Alliance only


def test_committed_data_lua_is_written_by_this_generator() -> None:
    assert Path(DATA_PATH).read_text(encoding="utf-8").startswith("-- Generated by `python -m scripts.wow_mob_drops.build`")
