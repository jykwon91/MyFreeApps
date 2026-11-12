"""The WoW Forever talent calculator's generator: trees from Blizzard's
talent-tree answers, the spell books the Classic side is read from, the Classic
comparison, the API client's errors, and the committed output's shape.
Fixtures are synthetic payloads and rows, never the network."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from scripts.wow_food.tooltip import SpellBook, evaluate
from scripts.wow_talents import blizzard_api
from scripts.wow_talents.blizzard_api import BlizzardStatic, blizzard_credentials, namespace_build
from scripts.wow_talents.books import classic_book, classic_effect, forever_book, forever_icons
from scripts.wow_talents.build import CLASSIC_DIR, TALENTS_DIR
from scripts.wow_talents.talents import (
    CLASS_IDS,
    CLASS_MASKS,
    COLUMNS,
    TIERS,
    ClassicTalent,
    Gaps,
    build_trees,
    classic_talents,
    compare_with_classic,
    match_classic,
    rank_spells,
    rank_text,
    tree_band,
    tree_doc,
    tree_spells,
)


def _talent_row(talent_id: int, tab: int, ranks: list[int]) -> dict[str, str]:
    row = {"ID": str(talent_id), "TabID": str(tab)}
    for i in range(9):
        row[f"SpellRank_{i}"] = str(ranks[i] if i < len(ranks) else 0)
    return row


def _tab(tab_id: int, mask: int) -> dict[str, str]:
    return {"ID": str(tab_id), "ClassMask": str(mask)}


def _effect_row(spell: int, base: float, index: int = 0, difficulty: int = 0, **extra: str) -> dict[str, str]:
    row = {
        "SpellID": str(spell), "EffectIndex": str(index), "DifficultyID": str(difficulty), "Effect": "6",
        "EffectAura": "107", "EffectBasePointsF": str(base), "EffectMiscValue_0": "0", "EffectAuraPeriod": "0",
        "EffectTriggerSpell": "0", "Variance": "0", "EffectRadiusIndex_0": "0", "EffectChainTargets": "0",
    }
    row.update(extra)
    return row


def _forever_tables(**overrides: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    tables: dict[str, list[dict[str, str]]] = {
        "SpellName": [{"ID": "100", "Name_lang": "Improved Fireball"}, {"ID": "101", "Name_lang": "Improved Fireball"}],
        "Spell": [{"ID": "100", "Description_lang": "Reduces the casting time of your Fireball by ${$m1/-1000}.1 sec."}],
        "SpellEffect": [_effect_row(100, -100), _effect_row(100, -999, difficulty=1)],
        "SpellMisc": [
            {"SpellID": "100", "DifficultyID": "0", "DurationIndex": "0", "RangeIndex": "0", "SpellIconFileDataID": "135807"},
            {"SpellID": "100", "DifficultyID": "1", "DurationIndex": "0", "RangeIndex": "0", "SpellIconFileDataID": "1"},
        ],
        "SpellAuraOptions": [],
        "SpellDuration": [],
        "SpellRadius": [],
        "SpellRange": [],
        "SpellTargetRestrictions": [],
        "SpellDescriptionVariables": [],
        "SpellXDescriptionVariables": [],
    }
    tables.update(overrides)
    return tables


# --- rows -------------------------------------------------------------------


def test_rank_spells_skip_empty_slots() -> None:
    assert rank_spells(_talent_row(1, 41, [100, 101, 102])) == (100, 101, 102)


# --- the Forever book -------------------------------------------------------


def test_forever_book_reads_the_normal_difficulty_only() -> None:
    book = forever_book(_forever_tables())
    assert [e.base_points for e in book.effects[100]] == [-100]
    assert forever_icons(_forever_tables()["SpellMisc"]) == {100: 135807}


def test_forever_book_fills_radius_proc_options_and_durations() -> None:
    tables = _forever_tables(
        SpellEffect=[_effect_row(100, 5, EffectRadiusIndex_0="8", EffectChainTargets="3")],
        SpellRadius=[{"ID": "8", "Radius": "10"}],
        SpellAuraOptions=[{"SpellID": "100", "DifficultyID": "0", "ProcChance": "20", "ProcCharges": "2", "CumulativeAura": "5"}],
        SpellMisc=[{"SpellID": "100", "DifficultyID": "0", "DurationIndex": "4", "RangeIndex": "0", "SpellIconFileDataID": "1"}],
        SpellDuration=[{"ID": "4", "Duration": "12000"}],
    )
    book = forever_book(tables)
    assert (book.effects[100][0].radius_yards, book.effects[100][0].chain_targets) == (10.0, 3)
    assert (book.aura_options[100].proc_chance, book.aura_options[100].proc_charges, book.aura_options[100].stacks) == (20, 2, 5)
    assert book.durations_ms[100] == 12000


def test_forever_book_fills_targets_range_variables_and_effect_multiples() -> None:
    # Psychic Scream / Searing Totem / Immolate shaped rows from the Forever client.
    tables = _forever_tables(
        SpellEffect=[_effect_row(
            100, 5, EffectRadiusIndex_1="14", EffectPointsPerResource="5.5", EffectAmplitude="2",
            EffectChainAmplitude="0.3",
        )],
        SpellRadius=[{"ID": "14", "Radius": "8"}],
        SpellRange=[{"ID": "3", "RangeMax_0": "20", "RangeMax_1": "20"}, {"ID": "6", "RangeMax_0": "0", "RangeMax_1": "40"}],
        SpellMisc=[
            {"SpellID": "100", "DifficultyID": "0", "DurationIndex": "0", "RangeIndex": "3", "SpellIconFileDataID": "1"},
            {"SpellID": "101", "DifficultyID": "0", "DurationIndex": "0", "RangeIndex": "6", "SpellIconFileDataID": "1"},
        ],
        SpellTargetRestrictions=[
            {"SpellID": "100", "DifficultyID": "0", "MaxTargets": "2", "MaxTargetLevel": "40"},
            {"SpellID": "100", "DifficultyID": "1", "MaxTargets": "9", "MaxTargetLevel": "0"},
        ],
        SpellDescriptionVariables=[{"ID": "859", "Variables": "$mult1=$?s17815[${1.05}][${1.0}]\n$mult=${$<mult1>}"}],
        SpellXDescriptionVariables=[{"ID": "1", "SpellID": "100", "SpellDescriptionVariablesID": "859"}],
    )
    book = forever_book(tables)
    effect = book.effects[100][0]
    # The radius sits in the second slot when the first is empty (Arcane Explosion's 10 yards).
    assert effect.radius_yards == 8.0
    assert (effect.points_per_resource, effect.amplitude, effect.chain_amplitude) == (5.5, 2.0, 0.3)
    assert (book.max_targets, book.max_target_levels) == ({100: 2}, {100: 40})
    # A heal has only a friendly range.
    assert book.ranges_yards == {100: 20.0, 101: 40.0}
    assert book.variables == {100: {"mult1": "$?s17815[${1.05}][${1.0}]", "mult": "${$<mult1>}"}}


# --- the Classic book -------------------------------------------------------


def _template(spell: int, **values: object) -> dict[str, object]:
    return {"Id": spell, **values}


def test_classic_effect_adds_the_die_to_the_base() -> None:
    # Improved Charge: 29 + 1d1 = 30 (rage is counted in tenths).
    effect = classic_effect(_template(12285, Effect1=6, EffectBasePoints1=29, EffectBaseDice1=1, EffectDieSides1=1), 1, {})
    assert effect is not None
    assert (effect.base_points, effect.variance) == (30, 0.0)


def test_classic_effect_that_rolls_reads_as_a_range() -> None:
    book = classic_book(
        [{"ID": "7", "Description_lang": "Deals $s1 damage."}],
        [],
        [],
        [],
        [],
        [_template(7, Effect1=2, EffectBasePoints1=9, EffectBaseDice1=1, EffectDieSides1=5)],
    )
    assert evaluate(book, 7) == "Deals 10 to 14 damage."


def test_classic_effect_slot_without_an_effect_is_skipped() -> None:
    assert classic_effect(_template(1, Effect1=0), 1, {}) is None


def test_classic_book_reads_procs_durations_and_radius() -> None:
    book = classic_book(
        [{"ID": "7", "Description_lang": "A $h% chance for $d to hit everyone within $a1 yards."}],
        [{"ID": "7", "Name_lang": "Test"}],
        [{"ID": "21", "Duration": "6000"}],
        [{"ID": "13", "Radius": "8"}],
        [],
        [_template(7, ProcChance=25, DurationIndex=21, Effect1=6, EffectBasePoints1=0, EffectBaseDice1=1, EffectDieSides1=1, EffectRadiusIndex1=13)],
    )
    assert evaluate(book, 7) == "A 25% chance for 6 sec to hit everyone within 8 yards."


def test_classic_book_reads_the_renamed_effect_fields_targets_and_range() -> None:
    """1.12's EffectMultipleValue / DmgMultiplier / EffectPointsPerComboPoint are
    the modern client's EffectAmplitude / EffectChainAmplitude / EffectPointsPerResource."""
    book = classic_book(
        [{"ID": "7", "Description_lang": "Drains $e1 mana, $f1 more, $b1 per point; $i foes up to level $v within $r yds."}],
        [],
        [],
        [],
        [{"ID": "5", "RangeMax_0": "30", "RangeMax_1": "30"}],
        [_template(
            7, Effect1=2, EffectBasePoints1=0, EffectBaseDice1=1, EffectDieSides1=1,
            EffectMultipleValue1=2, DmgMultiplier1=3, EffectPointsPerComboPoint1=-80,
            MaxAffectedTargets=5, MaxTargetLevel=40, RangeIndex=5,
        )],
    )
    assert evaluate(book, 7) == "Drains 2 mana, 3 more, 80 per point; 5 foes up to level 40 within 30 yds."




# --- rank text --------------------------------------------------------------


def test_rank_text_joins_lines_and_ends_a_bare_one() -> None:
    assert rank_text("Requires Bear Form, Dire Bear Form\r\nCharge an enemy.\r\n\r\n") == (
        "Requires Bear Form, Dire Bear Form. Charge an enemy."
    )
    assert rank_text("Increases damage by 5%.  Lasts 6 sec.\r\n") == "Increases damage by 5%. Lasts 6 sec."
    assert rank_text("Grants 3 rage") == "Grants 3 rage"


# --- trees from the API -----------------------------------------------------


def _rank(talent_id: int, name: str, spell: int, text: str) -> dict[str, Any]:
    return {
        "tooltip": {
            "talent": {"id": talent_id, "name": name},
            "spell_tooltip": {"spell": {"id": spell}, "description": text},
        },
    }


def _node(
    node_id: int, talent_id: int, name: str, row: int, col: int, ranks: int = 1, locked_by: list[int] | None = None,
) -> dict[str, Any]:
    node: dict[str, Any] = {
        "id": node_id,
        "display_row": row,
        "display_col": col,
        "ranks": [_rank(talent_id, name, talent_id * 10, f"{name} rank {r + 1}.") for r in range(ranks)],
    }
    if locked_by:
        node["locked_by"] = locked_by
    return node


def _spec(class_id: int, spec: int, name: str, nodes: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "playable_class": {"id": class_id},
        "playable_specialization": {"id": spec},
        "name": name,
        "spec_talent_nodes": nodes,
    }


def _warlock() -> list[dict[str, Any]]:
    # The index's order isn't the game's: the column band is.
    return [
        _spec(9, 593, "Destruction", [_node(30, 300, "Bane", 1, 15)]),
        _spec(9, 355, "Affliction", [
            _node(13, 103, "Curse of Exhaustion", 4, 3, locked_by=[12]),
            _node(11, 101, "Suppression", 1, 2, ranks=5),
            _node(12, 102, "Amplify Curse", 3, 3),
            _node(14, 104, "Pandemic", 3, 4, ranks=3),
            _node(15, 105, "Stray Copy", 63, 2),
        ]),
        _spec(9, 354, "Demonology", [_node(20, 200, "Fel Domination", 3, 8), _node(21, 201, "Wide Copy", 7, 170)]),
        _spec(6, 250, "Blood", [_node(40, 400, "Not Classic", 1, 1)]),
    ]


def _built() -> tuple[dict[str, list[Any]], Gaps]:
    gaps = Gaps()
    icons = {1010: 136230, 1020: 136132}
    return build_trees(_warlock(), icons, {355: 136145}, gaps), gaps


def test_trees_are_in_game_order_by_their_column_band() -> None:
    classes, _ = _built()
    assert list(classes) == ["warlock"]
    assert [t.name for t in classes["warlock"]] == ["Affliction", "Demonology", "Destruction"]
    assert [t.id for t in classes["warlock"]] == [355, 354, 593]
    assert [t.icon for t in classes["warlock"]] == [136145, 0, 0]


def test_a_tree_band_is_where_most_of_its_talents_sit() -> None:
    assert tree_band([_node(1, 1, "A", 1, 14), _node(2, 2, "B", 2, 16), _node(3, 3, "C", 7, 170)]) == 2


def test_talents_are_in_tier_then_column_order_with_zero_based_places() -> None:
    classes, _ = _built()
    affliction, _, destruction = classes["warlock"]
    assert [(t.name, t.tier, t.column) for t in affliction.talents] == [
        ("Suppression", 0, 1), ("Amplify Curse", 2, 2), ("Pandemic", 2, 3), ("Curse of Exhaustion", 3, 2),
    ]
    assert [(t.tier, t.column) for t in destruction.talents] == [(0, 1)]


def test_a_talent_carries_its_ranks_spell_icon_and_id() -> None:
    classes, gaps = _built()
    suppression = classes["warlock"][0].talents[0]
    assert (suppression.id, suppression.spell, suppression.icon) == (101, 1010, 136230)
    assert suppression.ranks == tuple(f"Suppression rank {r}." for r in range(1, 6))
    assert "warlock Affliction: Pandemic (spell 1040)" in gaps.no_icon


def test_a_prerequisite_needs_the_required_talent_at_its_max_rank() -> None:
    classes, _ = _built()
    exhaustion = classes["warlock"][0].talents[3]
    assert exhaustion.prereqs == ((102, 1),)
    payload = [_spec(9, 355, "Affliction", [_node(1, 11, "Suppression", 1, 1, ranks=5), _node(2, 12, "Next", 2, 1, locked_by=[1])])]
    (tree,) = build_trees(payload, {}, {}, Gaps())["warlock"]
    assert tree.talents[1].prereqs == ((11, 5),)


def test_nodes_off_the_grid_are_left_out_and_reported() -> None:
    classes, gaps = _built()
    names = {t.name for tree in classes["warlock"] for t in tree.talents}
    assert not names & {"Stray Copy", "Wide Copy"}
    assert gaps.off_grid == [
        "warlock Affliction: Stray Copy at row 63, column 2",
        "warlock Demonology: Wide Copy at row 7, column 170",
    ]


def test_a_requirement_on_a_lower_row_is_dropped_and_reported() -> None:
    payload = [_spec(3, 50, "Beast Mastery", [
        _node(1, 11, "Bestial Swiftness", 3, 2),
        _node(2, 12, "Intimidation", 5, 2, locked_by=[1, 3]),
        _node(3, 13, "Bestial Wrath", 7, 2, locked_by=[2]),
    ])]
    gaps = Gaps()
    (tree,) = build_trees(payload, {}, {}, gaps)["hunter"]
    assert [t.prereqs for t in tree.talents] == [(), ((11, 1),), ((12, 1),)]
    assert gaps.backward_prereqs == ["hunter Beast Mastery: Intimidation -> Bestial Wrath"]


def test_a_class_the_site_does_not_list_is_skipped() -> None:
    classes, _ = _built()
    assert all(t.id != 250 for trees in classes.values() for t in trees)


def test_every_classic_class_has_a_mask_and_an_api_id() -> None:
    classes = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"]
    assert sorted(CLASS_MASKS.values()) == classes
    assert sorted(CLASS_IDS.values()) == classes


def test_tree_spells_are_every_talents_rank_one_spell() -> None:
    assert tree_spells(_warlock()) == {1010, 1020, 1030, 1040, 1050, 2000, 2010, 3000, 4000}


def test_tree_doc_marks_new_talents_only() -> None:
    classes, _ = _built()
    doc = tree_doc(classes["warlock"][0], {104})
    assert (doc["id"], doc["name"], doc["icon"]) == (355, "Affliction", 136145)
    talents = {t["name"]: t for t in doc["talents"]}  # type: ignore[attr-defined]
    assert talents["Pandemic"]["newInForever"] is True
    assert "newInForever" not in talents["Suppression"]
    assert talents["Curse of Exhaustion"]["prereqs"] == [[102, 1]]
    assert talents["Suppression"]["spell"] == 1010
    assert talents["Suppression"]["ranks"] == [f"Suppression rank {r}." for r in range(1, 6)]


# --- the Classic comparison -------------------------------------------------


def test_classic_talents_are_grouped_by_class_and_named_by_their_rank_one_spell() -> None:
    tabs = [_tab(302, 256), _tab(999, 0)]
    talents = [_talent_row(1, 302, [18174, 18175]), _talent_row(2, 999, [5]), _talent_row(3, 302, [])]
    assert classic_talents(tabs, talents, {18174: "Suppression"}) == {
        "warlock": [ClassicTalent("Suppression", (18174, 18175))],
    }


def _one_talent_tree(name: str, spell: int, ranks: list[str]) -> Any:
    payload = [_spec(9, 355, "Affliction", [{
        "id": 1, "display_row": 1, "display_col": 1,
        "ranks": [_rank(900, name, spell, text) for text in ranks],
    }])]
    return build_trees(payload, {}, {}, Gaps())["warlock"][0]


def test_a_talent_matches_classic_by_spell_then_by_name() -> None:
    by_spell = ClassicTalent("Old Name", (100, 101))
    by_name = ClassicTalent("Improved Drains", (200,))
    renamed = _one_talent_tree("Improved Drains", 100, ["x"]).talents[0]
    assert match_classic(renamed, [by_name, by_spell]) == by_spell
    same_name = _one_talent_tree("improved  drains", 300, ["x"]).talents[0]
    assert match_classic(same_name, [by_spell, by_name]) == by_name
    assert match_classic(_one_talent_tree("Pandemic", 400, ["x"]).talents[0], [by_spell, by_name]) is None


def _compare(forever: list[str], classic: dict[int, str]) -> Any:
    tree = _one_talent_tree("Suppression", 100, forever)
    return compare_with_classic([tree], [ClassicTalent("Suppression", (100, 101))], SpellBook(descriptions=classic))


def test_a_changed_rank_carries_classics_text_of_the_same_rank() -> None:
    comparison = _compare(["Hit by 1%.", "Hit by 2%."], {100: "Hit by 1%.", 101: "Resist by 4%."})
    assert comparison.changes == {900: [None, "Resist by 4%."]}
    assert comparison.new == set()


def test_case_and_spacing_differences_are_not_changes() -> None:
    assert _compare(["Increases  Damage by 5%.", "x"], {100: "increases damage by 5%.", 101: "x"}).changes == {}


def test_a_rank_classic_lacks_or_cannot_fill_is_not_compared() -> None:
    assert _compare(["A.", "B.", "C."], {100: "A.", 101: "B."}).changes == {}
    assert _compare(["A.", "B."], {100: "Increases damage by $s1%.", 101: "B."}).changes == {}


def test_a_talent_without_a_classic_match_is_new() -> None:
    tree = _one_talent_tree("Pandemic", 400, ["x"])
    comparison = compare_with_classic([tree], [ClassicTalent("Suppression", (100,))], SpellBook())
    assert comparison.new == {900}
    assert comparison.changes == {}


# --- the API client ---------------------------------------------------------

_TREE_HREF = (
    "https://us.api.blizzard.com/data/wow/talent-tree/1116/playable-specialization/355"
    "?namespace=static-1.60.1_70399-forever-us"
)


def _client(handler: Any) -> BlizzardStatic:
    return BlizzardStatic("id", "secret", transport=httpx.MockTransport(handler))


def _api(request: httpx.Request) -> httpx.Response:
    if request.url.host == "oauth.battle.net":
        return httpx.Response(200, json={"access_token": "t", "expires_in": 86399})
    assert request.url.params["namespace"] == "static-forever-us"
    assert request.headers["Authorization"] == "Bearer t"
    path = request.url.path
    if path == "/data/wow/talent-tree/index":
        return httpx.Response(200, json={
            "_links": {"self": {"href": "https://us.api.blizzard.com/data/wow/talent-tree/?namespace=static-1.60.1_70399-forever-us"}},
            "spec_talent_trees": [{"key": {"href": _TREE_HREF}, "name": "Affliction"}],
        })
    if path == "/data/wow/talent-tree/1116/playable-specialization/355":
        return httpx.Response(200, json=_warlock()[1])
    if path == "/data/wow/media/spell/1040":
        return httpx.Response(200, json={"assets": [{"key": "icon", "value": "https://x/1.jpg", "file_data_id": 136227}]})
    return httpx.Response(404, json={"code": 404, "type": "BLZWEBAPI00000404", "detail": "Not Found"})


def test_the_client_reads_the_build_trees_and_icons() -> None:
    with _client(_api) as api:
        build, payloads = api.talent_trees()
        assert build == "1.60.1.70399"
        assert [p["name"] for p in payloads] == ["Affliction"]
        assert api.icon_file("/data/wow/media/spell/1040") == 136227


def test_a_failed_call_stops_with_the_status_and_blizzards_code() -> None:
    with _client(_api) as api, pytest.raises(SystemExit, match="HTTP 404 code=BLZWEBAPI00000404 Not Found"):
        api.get("/data/wow/media/spell/1")


def test_a_refused_token_stops_with_the_oauth_error_and_no_secret() -> None:
    def refuse(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "invalid_client", "error_description": "Bad client"})

    with pytest.raises(SystemExit, match="token: HTTP 401 code=invalid_client Bad client") as stopped:
        _client(refuse).__enter__()
    assert "secret" not in str(stopped.value)


def test_missing_credentials_stop_the_run(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(blizzard_api.settings, "blizzard_client_id", "")
    with pytest.raises(SystemExit, match="BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET are not set"):
        blizzard_credentials()


def test_namespace_build_reads_the_versioned_namespace() -> None:
    assert namespace_build("https://x/?namespace=static-1.60.1_70399-forever-us") == "1.60.1.70399"
    assert namespace_build("https://x/") == ""


# --- the committed output ---------------------------------------------------


def _class_files() -> list[Path]:
    files = sorted(TALENTS_DIR.glob("*.json"))
    assert files, "run python -m scripts.wow_talents.build"
    return files


def _doc(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_every_class_has_three_trees_on_the_in_game_grid() -> None:
    files = _class_files()
    assert sorted(f.stem for f in files) == sorted(CLASS_MASKS.values())
    for path in files:
        doc = _doc(path)
        assert doc["apiBuild"]
        assert doc["classId"] == path.stem
        assert len(doc["trees"]) == 3
        for tree in doc["trees"]:
            places = [(t["tier"], t["column"]) for t in tree["talents"]]
            assert len(places) == len(set(places)), f"{path.stem} {tree['name']}: two talents share a cell"
            assert all(0 <= tier < TIERS and 0 <= col < COLUMNS for tier, col in places)
            assert places == sorted(places), f"{path.stem} {tree['name']}: talents out of tier-then-column order"
            assert tree["icon"], f"{path.stem} {tree['name']}: no tree icon"
            for talent in tree["talents"]:
                assert talent["name"] and talent["icon"] and talent["spell"], f"{path.stem} {talent['name']}"
                assert talent["ranks"] and all(talent["ranks"]), f"{path.stem} {talent['name']}: a rank has no text"


def test_prerequisites_are_talents_of_the_same_tree_no_lower_down_at_max_rank() -> None:
    for path in _class_files():
        for tree in _doc(path)["trees"]:
            by_id = {t["id"]: t for t in tree["talents"]}
            for talent in tree["talents"]:
                for required, rank in talent["prereqs"]:
                    assert required in by_id, f"{talent['name']} needs a talent outside its tree"
                    before = by_id[required]
                    assert before["tier"] <= talent["tier"]
                    assert rank == len(before["ranks"])


def test_classic_files_name_matched_talents_rank_for_rank() -> None:
    assert (CLASSIC_DIR / "LICENSE").is_file() and (CLASSIC_DIR / "README.md").is_file()
    for path in _class_files():
        talents = {t["id"]: t for tree in _doc(path)["trees"] for t in tree["talents"]}
        classic = _doc(CLASSIC_DIR / path.name)
        assert set(classic) == {"source", "classId", "talents"}
        for talent_id, ranks in classic["talents"].items():
            talent = talents[int(talent_id)]
            assert len(ranks) == len(talent["ranks"])
            assert any(ranks)
            assert not talent.get("newInForever")


@pytest.mark.parametrize(
    ("class_id", "tree", "names"),
    [
        ("warlock", "Affliction", {"Soul Harvest", "Improved Drains", "Pandemic", "Malevolence", "Shadow Mastery", "Wrack"}),
        ("warrior", "Arms", {"Mortal Strike"}),
        ("mage", "Arcane", {"Arcane Concentration", "Presence of Mind", "Arcane Power", "Missile Barrage"}),
    ],
)
def test_known_live_talents_are_in_their_tree(class_id: str, tree: str, names: set[str]) -> None:
    (found,) = [t for t in _doc(TALENTS_DIR / f"{class_id}.json")["trees"] if t["name"] == tree]
    assert names <= {t["name"] for t in found["talents"]}


def test_forever_only_talents_are_marked_new() -> None:
    (affliction,) = [t for t in _doc(TALENTS_DIR / "warlock.json")["trees"] if t["name"] == "Affliction"]
    talents = {t["name"]: t for t in affliction["talents"]}
    assert talents["Pandemic"].get("newInForever") is True
    assert "newInForever" not in talents["Suppression"]
    assert talents["Wrack"]["prereqs"] == [[talents["Siphon Life"]["id"], 1]]


def test_trees_are_in_game_order() -> None:
    assert [t["name"] for t in _doc(TALENTS_DIR / "warlock.json")["trees"]] == ["Affliction", "Demonology", "Destruction"]
