"""The Legacy planner's data: trees, one talent per node, gates, challenges and rank rewards."""
from __future__ import annotations

import json

import pytest

from scripts.wow_legacy.build import LEGACY_PATH, category_docs
from scripts.wow_legacy.legacy import (
    TREE_ORDER,
    build_trees,
    challenges,
    grid_positions,
    legacy_tree_ids,
    name_trees,
    node_entries,
    node_gates,
    point_cost,
    rank_cap,
    rank_rewards,
    reward_lines,
)


def _link(row_id: int, node: int, entry: int, index: int) -> dict[str, str]:
    return {"ID": str(row_id), "TraitNodeID": str(node), "TraitNodeEntryID": str(entry), "_Index": str(index)}


def _entry(entry: int, definition: int, max_ranks: int = 1) -> dict[str, str]:
    return {"ID": str(entry), "TraitDefinitionID": str(definition), "MaxRanks": str(max_ranks)}


def _definition(definition: int, spell: int) -> dict[str, str]:
    return {"ID": str(definition), "SpellID": str(spell), "OverrideName_lang": "", "OverrideIcon": "0"}


class TestNodeEntries:
    def test_entries_naming_the_same_spell_collapse_to_the_first(self) -> None:
        # Talented lists its one spell under five entries.
        links = [_link(i, 110298, 137370 + i, i * 100) for i in (5, 4, 3, 2, 1)]
        entries = {137370 + i: _entry(137370 + i, 900 + i) for i in range(1, 6)}
        definitions = {900 + i: _definition(900 + i, 1225474) for i in range(1, 6)}
        found = node_entries(links, entries, definitions, [110298])
        assert [(e.entry_id, e.spell) for e in found[110298]] == [(137371, 1225474)]

    def test_different_spells_stay_separate(self) -> None:
        links = [_link(1, 7, 10, 0), _link(2, 7, 11, 1)]
        entries = {10: _entry(10, 20), 11: _entry(11, 21)}
        definitions = {20: _definition(20, 1), 21: _definition(21, 2)}
        assert [e.spell for e in node_entries(links, entries, definitions, [7])[7]] == [1, 2]

    def test_a_node_with_no_link_has_no_entry(self) -> None:
        assert node_entries([], {}, {}, [7]) == {7: []}


class TestGates:
    def test_a_node_takes_the_highest_gate_of_its_groups(self) -> None:
        conds = [
            {"ID": "1", "TraitCurrencyID": "4225", "CondType": "0", "SpentAmountRequired": "5"},
            {"ID": "2", "TraitCurrencyID": "4225", "CondType": "0", "SpentAmountRequired": "10"},
            {"ID": "3", "TraitCurrencyID": "999", "CondType": "0", "SpentAmountRequired": "30"},
        ]
        group_conds = [
            {"TraitNodeGroupID": "50", "TraitCondID": "1"},
            {"TraitNodeGroupID": "51", "TraitCondID": "2"},
            {"TraitNodeGroupID": "52", "TraitCondID": "3"},
        ]
        group_nodes = [
            {"TraitNodeGroupID": "50", "TraitNodeID": "100"},
            {"TraitNodeGroupID": "50", "TraitNodeID": "101"},
            {"TraitNodeGroupID": "51", "TraitNodeID": "101"},
            {"TraitNodeGroupID": "52", "TraitNodeID": "102"},
        ]
        assert node_gates(conds, group_conds, group_nodes, 4225) == {100: 5, 101: 10}


class TestLayout:
    def test_positions_share_one_grid_across_trees(self) -> None:
        nodes = [
            {"ID": "1", "PosX": "2400", "PosY": "850"},
            {"ID": "2", "PosX": "4200", "PosY": "1750"},
            {"ID": "3", "PosX": "5100", "PosY": "3550"},
        ]
        assert grid_positions(nodes) == {1: (0, 0), 2: (2, 1), 3: (3, 3)}

    def test_only_the_systems_trees_with_nodes_count(self) -> None:
        trees = [{"ID": str(i), "TraitSystemID": "45"} for i in (1118, 1187, 1188)] + [{"ID": "9", "TraitSystemID": "1"}]
        nodes = [{"TraitTreeID": "1187"}, {"TraitTreeID": "1188"}, {"TraitTreeID": "9"}]
        assert legacy_tree_ids(trees, nodes) == [1187, 1188]


class TestTreeNames:
    def test_each_tree_is_named_by_its_signature_talent(self) -> None:
        names = name_trees({
            1: ["Reagent Economy", "Gourmand"],
            2: ["Working Overtime"],
            3: ["Thrill of Adventure"],
        })
        assert names == {1: "Resourcefulness", 2: "Professions", 3: "Adventure"}

    def test_a_missing_signature_stops_the_run(self) -> None:
        with pytest.raises(SystemExit):
            name_trees({1: ["Working Overtime"], 2: ["Thrill of Adventure"], 3: ["Something else"]})


def _tables() -> dict[str, list[dict[str, str]]]:
    """Three one-node trees plus a second, gated node and a placeholder in Professions."""
    signatures = {1187: "Working Overtime", 1188: "Thrill of Adventure", 1189: "Reagent Economy"}
    nodes, links, entries, definitions = [], [], [], []
    spell_of: dict[int, int] = {}
    for i, tree in enumerate(signatures):
        node = 100 + i
        nodes.append({"ID": str(node), "TraitTreeID": str(tree), "PosX": "2400", "PosY": str(850 + 900 * i), "Flags": "0"})
        spell_of[node] = 5000 + i
    nodes.append({"ID": "200", "TraitTreeID": "1187", "PosX": "3300", "PosY": "850", "Flags": "0"})
    nodes.append({"ID": "201", "TraitTreeID": "1187", "PosX": "4200", "PosY": "850", "Flags": "2"})
    spell_of[200] = 6000
    spell_of[201] = 7000
    for node, spell in spell_of.items():
        links.append(_link(node, node, node, 100))
        entries.append(_entry(node, node, 5))
        definitions.append(_definition(node, spell))
    return {
        "TraitTree": [{"ID": str(t), "TraitSystemID": "45"} for t in (1118, *signatures)],
        "TraitNode": nodes,
        "TraitTreeXTraitCurrency": [{"TraitTreeID": str(t), "TraitCurrencyID": "4225"} for t in signatures],
        "TraitNodeXTraitNodeEntry": links,
        "TraitNodeEntry": entries,
        "TraitDefinition": definitions,
        "TraitCond": [{"ID": "1", "TraitCurrencyID": "4225", "CondType": "0", "SpentAmountRequired": "5"}],
        "TraitNodeGroupXTraitCond": [{"TraitNodeGroupID": "9", "TraitCondID": "1"}],
        "TraitNodeGroupXTraitNode": [{"TraitNodeGroupID": "9", "TraitNodeID": "200"}],
        "TraitEdge": [{"LeftTraitNodeID": "100", "RightTraitNodeID": "200"}, {"LeftTraitNodeID": "100", "RightTraitNodeID": "101"}],
    }


class TestBuildTrees:
    def test_trees_come_out_named_in_order_with_gates_edges_and_placeholders(self) -> None:
        names = {5000: "Working Overtime", 5001: "Thrill of Adventure", 5002: "Reagent Economy", 6000: "Master Chef", 7000: "Unknown"}
        trees, currency = build_trees(_tables(), names, {}, lambda spell: f"text {spell}")
        assert currency == 4225
        assert [t.name for t in trees] == list(TREE_ORDER)
        professions = trees[0]
        assert [(n.name, n.gate, n.coming_later) for n in professions.nodes] == [
            ("Working Overtime", 0, False), ("Master Chef", 5, False), ("Unknown", 0, True),
        ]
        # An edge to another tree's node is left out.
        assert professions.edges == ((100, 200),)

    def test_a_node_with_two_talents_stops_the_run(self) -> None:
        tables = _tables()
        tables["TraitNodeXTraitNodeEntry"].append(_link(999, 100, 998, 200))
        tables["TraitNodeEntry"].append(_entry(998, 997))
        tables["TraitDefinition"].append(_definition(997, 1234))
        with pytest.raises(SystemExit):
            build_trees(tables, {5000: "Working Overtime"}, {}, lambda _: None)


def _ach(ach_id: int, title: str, category: int) -> dict[str, str]:
    return {"ID": str(ach_id), "Title_lang": title, "Category": str(category), "IconFileID": "625999"}


class TestChallenges:
    def test_variants_merge_and_zero_point_rows_drop(self) -> None:
        sources = [
            {"ID": "1", "TraitCurrencyID": "4225", "Amount": "1", "AchievementID": "61502", "Requirement_lang": "Reach Level 25 on a Druid"},
            {"ID": "2", "TraitCurrencyID": "4225", "Amount": "1", "AchievementID": "63972", "Requirement_lang": "Reach Level 25 on a Druid"},
            {"ID": "3", "TraitCurrencyID": "4225", "Amount": "0", "AchievementID": "64283", "Requirement_lang": "Play in the Beta"},
            {"ID": "4", "TraitCurrencyID": "4225", "Amount": "1", "AchievementID": "70000", "Requirement_lang": "Clear a dungeon"},
            {"ID": "5", "TraitCurrencyID": "3820", "Amount": "1", "AchievementID": "70001", "Requirement_lang": "Other system"},
        ]
        achievements = {
            61502: _ach(61502, "Novice Druid", 11), 63972: _ach(63972, "Novice Druid", 11),
            64283: _ach(64283, "Beta", 10), 70000: _ach(70000, "Delver", 20), 70001: _ach(70001, "X", 20),
        }
        categories = {
            10: {"ID": "10", "Name_lang": "Classes", "Parent": "-1", "Ui_order": "3"},
            11: {"ID": "11", "Name_lang": "Druid", "Parent": "10", "Ui_order": "1"},
            20: {"ID": "20", "Name_lang": "Dungeons", "Parent": "-1", "Ui_order": "5"},
        }
        found = challenges(sources, achievements, categories, 4225)
        assert [(c.key, c.category, c.group, c.achievements) for c in found] == [
            ("61502", "Classes", "Druid", (61502, 63972)),
            ("70000", "Dungeons", None, (70000,)),
        ]
        docs = category_docs(found)
        assert [(d["name"], [g["name"] for g in d["groups"]]) for d in docs] == [("Classes", ["Druid"]), ("Dungeons", [None])]


class TestRankAndCost:
    def test_rewards_use_the_toast_name_when_the_name_is_blank(self) -> None:
        rows = [
            {"CovenantID": "48", "Level": "25", "Name_lang": "Spectral Bear Cub", "ToastDescription_lang": "", "Description_lang": "A cub.", "ItemID": "2", "Icon": "20"},
            {"CovenantID": "48", "Level": "15", "Name_lang": "", "ToastDescription_lang": "Air Rifle", "Description_lang": "Shoot.|n|n|cFFFFFFFFVisit Wiley.|R", "ItemID": "1", "Icon": "10"},
            {"CovenantID": "7", "Level": "1", "Name_lang": "Other", "ToastDescription_lang": "", "Description_lang": "", "ItemID": "3", "Icon": "0"},
        ]
        assert [(r.rank, r.name, r.lines) for r in rank_rewards(rows)] == [
            (15, "Air Rifle", ("Shoot.", "Visit Wiley.")),
            (25, "Spectral Bear Cub", ("A cub.",)),
        ]

    def test_reward_lines_drop_markup_and_empty_paragraphs(self) -> None:
        assert reward_lines("One.|n|n|cFFFFFFFFTwo.|r") == ("One.", "Two.")

    def test_the_rank_cap_needs_the_named_currency(self) -> None:
        assert rank_cap({3485: {"Name_lang": "Renown - Legacy Rank", "MaxQty": "90"}}) == 90
        with pytest.raises(SystemExit):
            rank_cap({3485: {"Name_lang": "Something else", "MaxQty": "90"}})

    def test_the_point_cost_must_spend_legacy_points(self) -> None:
        assert point_cost({4845: {"TraitCurrencyID": "4225", "Amount": "1"}}, 4225) == 1
        with pytest.raises(SystemExit):
            point_cost({4845: {"TraitCurrencyID": "1", "Amount": "1"}}, 4225)


@pytest.fixture(scope="module")
def doc() -> dict:
    return json.loads(LEGACY_PATH.read_text(encoding="utf-8"))


class TestCommittedFile:
    def test_three_named_trees_of_nine_nodes(self, doc: dict) -> None:
        assert [t["name"] for t in doc["trees"]] == list(TREE_ORDER)
        assert all(len(t["nodes"]) == 9 for t in doc["trees"])

    def test_cap_gates_and_talented_once(self, doc: dict) -> None:
        assert doc["currency"]["cap"] == 16
        gates = {n["gate"] for t in doc["trees"] for n in t["nodes"]}
        assert gates == {0, 5, 10}
        talented = [n for t in doc["trees"] for n in t["nodes"] if n["name"] == "Talented"]
        assert len(talented) == 1 and talented[0]["maxRanks"] == 1

    def test_placeholders_are_marked_and_real_nodes_have_text(self, doc: dict) -> None:
        for tree in doc["trees"]:
            later = [n for n in tree["nodes"] if n["comingLater"]]
            assert len(later) == 2
            assert all(n["text"] for n in tree["nodes"] if not n["comingLater"])

    def test_challenges_and_rewards(self, doc: dict) -> None:
        count = sum(len(g["challenges"]) for c in doc["categories"] for g in c["groups"])
        assert count == 65
        assert len(doc["categories"]) == 6
        assert doc["rank"]["max"] == 90
        assert [r["rank"] for r in doc["rank"]["rewards"]] == sorted(r["rank"] for r in doc["rank"]["rewards"])
