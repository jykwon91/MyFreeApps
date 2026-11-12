"""The WoW Forever "Changes vs Classic" generator: plain-words summaries, the
talent / spell / item / quest / zone diffs (unchanged rows never reported, new
rows always), the "since last build" stamp and the committed output's shape.
Fixtures are synthetic rows, never the network."""
from __future__ import annotations

import json
from typing import Any

from scripts.wow_changes.build import CHANGES_DIR, INDEX_PATH, SHARDS
from scripts.wow_changes.describe import (
    clean_text,
    describe_numbers,
    describe_ranks,
    describe_text,
    number_changes,
)
from scripts.wow_changes.entry import KIND_CHANGED, KIND_NEW, PROVENANCE_PUBLISHED, PROVENANCE_SEEN, Change
from scripts.wow_changes.items import (
    classic_stats,
    compare_item,
    item_changes,
    new_other_items,
)
from scripts.wow_changes.spells import (
    ClassSpell,
    SpellGaps,
    class_spells,
    spell_changes,
)
from scripts.wow_changes.stamp import previous_build, stamp
from scripts.wow_changes.talents import live_talent_spells, talent_changes
from scripts.wow_changes.world import quest_changes, zone_changes
from scripts.wow_dungeons.quest_cache import CachedQuest
from scripts.wow_food.tooltip import SpellBook
from scripts.wow_world_map.sources import WAGO_BUILD, WAGO_ERA_BUILD

# --- plain words ---------------------------------------------------------------------------------


def test_numbers_that_went_up_read_raised() -> None:
    assert describe_text("Damage increased by 10%.", "Damage increased by 15%.") == "Raised from 10% to 15%."


def test_numbers_that_went_down_read_lowered_and_mixed_read_changed() -> None:
    assert describe_numbers([("31", "26"), ("45", "38")]) == "Lowered from 31 to 26 and 45 to 38."
    assert describe_numbers([("2", "3"), ("9", "8")]) == "Changed from 2 to 3 and 9 to 8."


def test_many_moved_numbers_are_counted_and_new_words_read_reworded() -> None:
    assert describe_numbers([("1", "2")] * 4) == "4 numbers changed."
    assert describe_text("Stuns the target.", "Roots the target.") == "Text reworded."
    assert number_changes("Lasts 10 sec.", "Lasts 10 sec and slows.") is None


def test_clean_text_drops_colour_codes() -> None:
    assert clean_text("|cFFFF2020Requires  Cat Form|r ") == "Requires Cat Form"


def test_rank_summary_names_the_first_changed_rank_and_counts_the_rest() -> None:
    assert describe_ranks([("Rank 1", "Text reworded.")], 1) == "Text reworded."
    assert describe_ranks([("Rank 2", "Raised from 1 to 2.")], 5) == "Rank 2: Raised from 1 to 2."
    assert describe_ranks([("Rank 1", "A."), ("Rank 2", "B."), ("Rank 3", "C.")], 3) == "Rank 1: A. 2 more ranks changed."


# --- talents -------------------------------------------------------------------------------------


def _talent_file(*talents: dict[str, Any]) -> dict[str, Any]:
    return {"trees": [{"id": 1, "name": "Arms", "icon": 1, "talents": list(talents)}]}


def test_talents_report_changed_ranks_and_new_talents_but_not_unchanged_ones() -> None:
    forever = {"warrior": _talent_file(
        {"id": 10, "name": "Same", "icon": 5, "spell": 100, "ranks": ["Does a thing."]},
        {"id": 11, "name": "Moved", "icon": 6, "spell": 110, "ranks": ["Hits for 15%.", "Hits for 30%."]},
        {"id": 900, "name": "Brand New", "icon": 7, "spell": 900, "ranks": ["New thing.", "Newer thing."], "newInForever": True},
    )}
    classic = {"warrior": {"talents": {"11": [None, "Hits for 20%."]}}}
    changes = {c.key: c for c in talent_changes(forever, classic)}
    assert set(changes) == {"talent:warrior:11", "talent:warrior:900"}
    moved = changes["talent:warrior:11"]
    assert moved.kind == KIND_CHANGED
    assert moved.rows == (("Rank 2", "Hits for 20%.", "Hits for 30%."),)
    assert moved.summary == "Rank 2: Raised from 20% to 30%."
    assert moved.link == ("talent", "warrior", 11)
    new = changes["talent:warrior:900"]
    assert new.kind == KIND_NEW
    assert new.summary == "New talent with 2 ranks."
    assert new.rows == (("Rank 1", None, "New thing."),)
    # The live trees are Blizzard's Game Data API, so both rows carry its badge.
    assert {c.provenance for c in changes.values()} == {PROVENANCE_PUBLISHED}
    assert moved.doc()["provenance"] == "published"


def test_live_talent_spells_are_every_talents_rank_one_spell() -> None:
    forever = {"warrior": _talent_file({"id": 10, "spell": 100}, {"id": 11, "spell": 110})}
    assert live_talent_spells(forever.values()) == {100, 110}


# --- class spells --------------------------------------------------------------------------------


def _book(texts: dict[int, str]) -> SpellBook:
    return SpellBook(names={s: f"spell {s}" for s in texts}, descriptions=texts)


def test_spells_report_a_reworded_rank_and_a_new_spell_but_not_an_unchanged_one() -> None:
    forever_list = [
        ClassSpell("mage", 1, "Frostbolt", "Rank 1"),
        ClassSpell("mage", 2, "Frostbolt", "Rank 2"),
        ClassSpell("mage", 3, "Arcane Intellect", "Rank 1"),
        ClassSpell("mage", 500, "Blink Strike", ""),
    ]
    # Forever re-numbered Frostbolt Rank 2: it's paired by name and rank.
    classic_list = [
        ClassSpell("mage", 1, "Frostbolt", "Rank 1"),
        ClassSpell("mage", 20, "Frostbolt", "Rank 2"),
        ClassSpell("mage", 3, "Arcane Intellect", "Rank 1"),
    ]
    forever_book = _book({1: "Deals 10 damage.", 2: "Deals 25 damage.", 3: "Raises Intellect by 2.", 500: "Strikes."})
    classic_book = _book({1: "Deals 10 damage.", 20: "Deals 20 damage.", 3: "Raises intellect by 2."})
    changes = spell_changes(forever_list, classic_list, forever_book, classic_book, SpellGaps())
    by_key = {c.key: c for c in changes}
    assert set(by_key) == {"spell:mage:Frostbolt", "spell:mage:Blink Strike"}
    frostbolt = by_key["spell:mage:Frostbolt"]
    assert frostbolt.rows == (("Rank 2", "Deals 20 damage.", "Deals 25 damage."),)
    assert frostbolt.summary == "Rank 2: Raised from 20 to 25."
    assert by_key["spell:mage:Blink Strike"].kind == KIND_NEW
    assert by_key["spell:mage:Blink Strike"].rows == (("Spell", None, "Strikes."),)


def test_a_spell_text_with_an_unfilled_token_is_a_gap_not_a_change() -> None:
    gaps = SpellGaps()
    changes = spell_changes(
        [ClassSpell("mage", 1, "Frostbolt", "Rank 1")],
        [ClassSpell("mage", 1, "Frostbolt", "Rank 1")],
        _book({1: "Deals $s1 damage."}),
        _book({1: "Deals 10 damage."}),
        gaps,
    )
    assert changes == []
    assert gaps.incomplete == 1


def test_class_spells_leave_out_talent_ranks_placeholders_and_other_lines() -> None:
    abilities = [
        {"SkillLine": "6", "Spell": "1"},
        {"SkillLine": "6", "Spell": "2"},
        {"SkillLine": "6", "Spell": "3"},
        {"SkillLine": "999", "Spell": "4"},
        {"SkillLine": "6", "Spell": "1"},
    ]
    names = {1: "Frostbolt", 2: "Ice Barrier", 3: "Test (DND)", 4: "Cooking"}
    found = class_spells(abilities, {6: "mage"}, names, {1: "Rank 1"}, skip={2})
    assert found == [ClassSpell("mage", 1, "Frostbolt", "Rank 1")]


# --- items ---------------------------------------------------------------------------------------


def _sparse(item_id: int, name: str, *, ilvl: int = 40, req: int = 35, armor: int = 0,
            stats: dict[int, int] | None = None, quality: int = 2) -> dict[str, str]:
    row = {"ID": str(item_id), "Display_lang": name, "ItemLevel": str(ilvl), "RequiredLevel": str(req),
           "Resistances_0": str(armor), "OverallQualityID": str(quality), "MinDamage_0": "0", "MaxDamage_0": "0",
           "ItemDelay": "0"}
    for i, (stat, amount) in enumerate((stats or {}).items()):
        row[f"StatModifier_bonusStat_{i}"], row[f"StatModifier_bonusAmount_{i}"] = str(stat), str(amount)
    return row


def _item(item_id: int, name: str, *, ilvl: int = 40, req: int = 35, armor: int | None = None,
          stats: dict[str, int] | None = None, weapon: list[float] | None = None) -> dict[str, Any]:
    return {"id": item_id, "name": name, "quality": "uncommon", "slot": "chest", "itemType": "Mail",
            "itemLevel": ilvl, "requiredLevel": req, "armor": armor, "weapon": weapon, "stats": stats or {},
            "classes": None}


def test_items_report_moved_numbers_and_new_gear_but_not_unchanged_items() -> None:
    classic = {
        1: _sparse(1, "Same Vest", armor=100, stats={7: 5}),
        2: _sparse(2, "Moved Vest", ilvl=40, armor=100, stats={7: 5}),
    }
    items = [
        _item(1, "Same Vest", armor=100, stats={"stamina": 5, "hit_rating": 9}),
        _item(2, "Moved Vest", ilvl=45, armor=120, stats={"stamina": 7}),
        _item(3, "Forever Vest", ilvl=50, req=45),
    ]
    by_key = {c.key: c for c in item_changes(items, classic)}
    assert set(by_key) == {"item:2", "item:3"}
    moved = by_key["item:2"]
    assert moved.rows == (("Item level", "40", "45"), ("Armor", "100", "120"), ("Stamina", "5", "7"))
    assert moved.summary == "Item level raised from 40 to 45. Armor raised from 100 to 120. 1 more change."
    assert moved.link == ("item", 2)
    new = by_key["item:3"]
    assert new.kind == KIND_NEW
    assert new.summary == "New uncommon chest (mail), item level 50, requires level 45."


def test_item_compare_covers_names_stats_added_and_weapons() -> None:
    classic = _sparse(5, "Old Axe", stats={4: 3})
    classic.update({"MinDamage_0": "10", "MaxDamage_0": "20", "ItemDelay": "2600"})
    item = _item(5, "New Axe", stats={"agility": 2}, weapon=[12, 20, 2.6])
    rows = [row for row, _ in compare_item(item, classic)]
    assert ("Name", "Old Axe", "New Axe") in rows
    assert ("Damage", "10–20", "12–20") in rows
    assert ("Agility", None, "2") in rows
    assert ("Strength", "3", None) in rows
    assert not any(label == "Speed" for label, _, _ in rows)


def test_classic_stats_keep_only_the_compared_stats() -> None:
    assert classic_stats(_sparse(1, "x", stats={7: 5, 31: 9, 4: 2})) == {"stamina": 5, "strength": 2}


def test_new_other_items_lists_consumables_and_recipes_and_counts_the_rest() -> None:
    sparse = [_sparse(10, "Old Potion"), _sparse(11, "New Potion"), _sparse(12, "New Pattern"),
              _sparse(13, "Quest Thing"), _sparse(14, "Test Potion"), _sparse(15, "Listed Gear")]
    classes = {10: 0, 11: 0, 12: 9, 13: 12, 14: 0, 15: 4}
    changes, unlisted = new_other_items(sparse, classes, classic_ids={10}, listed={15})
    # Sorted by name.
    assert [(c.key, c.summary) for c in changes] == [("item:12", "New recipe."), ("item:11", "New consumable.")]
    assert unlisted == 1


# --- quests, zones and maps ----------------------------------------------------------------------


def test_new_quests_are_named_from_the_cache_and_unnamed_ones_counted() -> None:
    cached = {5: CachedQuest(5, "Old", 10, 5, (), (), ()), 7: CachedQuest(7, "A Dynamite Plan", 16, 9, (), (), ())}
    changes, unnamed = quest_changes([5, 7, 8], classic_ids={5}, cached=cached, seen_on="2026-11-08")
    assert [c.key for c in changes] == ["quest:7"]
    assert changes[0].summary == "New quest, level 16 (from level 9)."
    assert (changes[0].provenance, changes[0].seen_on) == (PROVENANCE_SEEN, "2026-11-08")
    assert unnamed == 1


def test_new_zones_link_to_the_world_map_and_maps_skip_repeats_and_placeholders() -> None:
    ui_maps = [
        {"ID": "1", "Name_lang": "Elwynn Forest", "Type": "3", "ParentUiMapID": "947"},
        {"ID": "2482", "Name_lang": "Mount Hyjal", "Type": "3", "ParentUiMapID": "1414"},
        {"ID": "2665", "Name_lang": "Zephras Isle", "Type": "3", "ParentUiMapID": "0"},
        {"ID": "2521", "Name_lang": "Zephras Isle", "Type": "3", "ParentUiMapID": "947"},
    ]
    maps = [
        {"ID": "0", "MapName_lang": "Eastern Kingdoms", "InstanceType": "0"},
        {"ID": "2991", "MapName_lang": "Zephras Isle", "InstanceType": "0"},
        {"ID": "3005", "MapName_lang": "Battle for Gilneas", "InstanceType": "3"},
        {"ID": "3104", "MapName_lang": "nothing to see here", "InstanceType": "0"},
    ]
    changes = zone_changes(ui_maps, {1}, maps, {0}, world_map_ids={2482})
    assert [(c.key, c.summary, c.link) for c in changes] == [
        ("zone:2482", "New zone.", ("map", 2482)),
        ("zone:2521", "New zone.", None),
        ("map:3005", "New battleground.", None),
    ]


# --- since last build ----------------------------------------------------------------------------


def _doc(key: str, summary: str = "x") -> dict[str, Any]:
    return Change(key=key, kind=KIND_CHANGED, name=key, summary=summary).doc()


def test_a_first_run_has_no_previous_build_and_no_since() -> None:
    assert previous_build(None, "2") is None
    assert [d["since"] for d in stamp([_doc("a")], None, "2")] == [None]


def test_a_new_build_keeps_since_for_unchanged_rows_and_stamps_new_or_changed_ones() -> None:
    previous = {"a": {**_doc("a"), "since": "1"}, "b": {**_doc("b"), "since": None}}
    stamped = stamp([_doc("a"), _doc("b", "moved"), _doc("c")], previous, "2")
    assert [d["since"] for d in stamped] == ["1", "2", "2"]
    assert previous_build({"build": "1", "previousBuild": None}, "2") == "1"


def test_rerunning_the_same_build_keeps_its_previous_build() -> None:
    assert previous_build({"build": "2", "previousBuild": "1"}, "2") == "1"


def test_entry_docs_leave_empty_fields_out() -> None:
    assert Change(key="k", kind=KIND_NEW, name="n", summary="s").doc() == {
        "key": "k", "kind": "new", "name": "n", "summary": "s",
    }


# --- the committed output ------------------------------------------------------------------------


def test_committed_feed_matches_its_index_and_the_pinned_builds() -> None:
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    assert (index["build"], index["classicBuild"]) == (WAGO_BUILD, WAGO_ERA_BUILD)
    assert index["shards"] == {c: [p for cat, _, p in SHARDS if cat == c] for c in index["counts"]}
    for category, paths in index["shards"].items():
        entries = [e for p in paths for e in json.loads((CHANGES_DIR / p).read_text(encoding="utf-8"))["entries"]]
        counts = {"changed": sum(e["kind"] == "changed" for e in entries), "new": sum(e["kind"] == "new" for e in entries)}
        assert counts == index["counts"][category], category
        assert len({e["key"] for e in entries}) == len(entries), category
        for entry in entries:
            assert entry["summary"], entry["key"]
            assert all(len(row) == 3 for row in entry.get("rows", [])), entry["key"]
    assert (CHANGES_DIR / "classic" / "LICENSE").is_file()
