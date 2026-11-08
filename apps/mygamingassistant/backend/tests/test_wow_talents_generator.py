"""The WoW Forever talent calculator's generator: trees from Talent/TalentTab
rows, rank texts from the spell books, the Classic comparison, and the
committed output's shape. Fixtures are synthetic rows, never the network."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_food.tooltip import SpellBook, evaluate
from scripts.wow_talents.books import classic_book, classic_effect, forever_book, forever_icons
from scripts.wow_talents.build import CLASSIC_DIR, TALENTS_DIR
from scripts.wow_talents.talents import (
    CLASS_MASKS,
    COLUMNS,
    TIERS,
    Fallback,
    Gaps,
    build_trees,
    classic_changes,
    prerequisites,
    rank_spells,
    rank_text,
    tidy,
)
from scripts.wow_world_map.sources import WAGO_BUILD


def _talent_row(talent_id: int, tab: int, tier: int, column: int, ranks: list[int], prereq: tuple[int, int] = (0, 0)) -> dict[str, str]:
    row = {"ID": str(talent_id), "TabID": str(tab), "TierID": str(tier), "ColumnIndex": str(column)}
    for i in range(9):
        row[f"SpellRank_{i}"] = str(ranks[i] if i < len(ranks) else 0)
    for i in range(3):
        row[f"PrereqTalent_{i}"] = str(prereq[0] if i == 0 else 0)
        row[f"PrereqRank_{i}"] = str(prereq[1] if i == 0 else 0)
    return row


def _tab(tab_id: int, name: str, mask: int, order: int, icon: int = 0) -> dict[str, str]:
    return {"ID": str(tab_id), "Name_lang": name, "ClassMask": str(mask), "OrderIndex": str(order), "SpellIconID": str(icon)}


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
            {"SpellID": "100", "DifficultyID": "0", "DurationIndex": "0", "SpellIconFileDataID": "135807"},
            {"SpellID": "100", "DifficultyID": "1", "DurationIndex": "0", "SpellIconFileDataID": "1"},
        ],
        "SpellAuraOptions": [],
        "SpellDuration": [],
        "SpellRadius": [],
    }
    tables.update(overrides)
    return tables


# --- rows -------------------------------------------------------------------


def test_rank_spells_skip_empty_slots() -> None:
    assert rank_spells(_talent_row(1, 41, 0, 0, [100, 101, 102])) == (100, 101, 102)


def test_prerequisite_ranks_are_zero_based_in_the_client() -> None:
    # PrereqRank 2 = "rank 3"; the calculator counts ranks from 1.
    assert prerequisites(_talent_row(2, 41, 2, 1, [100], prereq=(1, 2))) == ((1, 3),)
    assert prerequisites(_talent_row(2, 41, 2, 1, [100])) == ()


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
        SpellMisc=[{"SpellID": "100", "DifficultyID": "0", "DurationIndex": "4", "SpellIconFileDataID": "1"}],
        SpellDuration=[{"ID": "4", "Duration": "12000"}],
    )
    book = forever_book(tables)
    assert (book.effects[100][0].radius_yards, book.effects[100][0].chain_targets) == (10.0, 3)
    assert (book.aura_options[100].proc_chance, book.aura_options[100].proc_charges, book.aura_options[100].stacks) == (20, 2, 5)
    assert book.durations_ms[100] == 12000


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
        [_template(7, ProcChance=25, DurationIndex=21, Effect1=6, EffectBasePoints1=0, EffectBaseDice1=1, EffectDieSides1=1, EffectRadiusIndex1=13)],
    )
    assert evaluate(book, 7) == "A 25% chance for 6 sec to hit everyone within 8 yards."


# --- rank text --------------------------------------------------------------


def test_rank_text_evaluates_the_tokens() -> None:
    book = forever_book(_forever_tables())
    assert rank_text(book, 100) == "Reduces the casting time of your Fireball by 0.1 sec."


def test_a_rank_the_client_does_not_have_is_none() -> None:
    assert rank_text(forever_book(_forever_tables()), 999) is None


def test_a_sentence_with_an_unfillable_token_is_left_out_and_reported() -> None:
    book = SpellBook(descriptions={5: "Absorbs ${431+$SPFR} damage. Lasts 1 min."})
    gaps = Gaps()
    assert rank_text(book, 5, gaps) == "Lasts 1 min."
    assert gaps.unresolved == {5: ["${431+$SPFR}"]}


def test_tidy_keeps_text_without_tokens() -> None:
    assert tidy("Increases  damage by 5%.  Lasts 6 sec.") == "Increases damage by 5%. Lasts 6 sec."


def test_conditionals_read_as_a_player_without_the_tuning_spell() -> None:
    book = SpellBook(descriptions={5: "Increases damage by 5%.$?s436895[ And healing.][ Only damage.]"})
    assert rank_text(book, 5) == "Increases damage by 5%. Only damage."


# --- trees ------------------------------------------------------------------


def _trees(fallback: Fallback | None = None) -> tuple[dict[str, list], Gaps]:
    tabs = [_tab(61, "Frost", 128, 2), _tab(41, "Fire", 128, 1, icon=135810), _tab(81, "Arcane", 128, 0), _tab(999, "Pet", 0, 0)]
    talents = [
        _talent_row(2, 41, 1, 0, [101, 102], prereq=(1, 4)),
        _talent_row(1, 41, 0, 1, [100, 103, 104, 105, 106]),
        _talent_row(3, 41, 0, 0, [200]),
    ]
    gaps = Gaps()
    return build_trees(tabs, talents, forever_book(_forever_tables()), {100: 135807}, gaps, fallback), gaps


def test_trees_are_grouped_by_class_and_ordered_left_to_right() -> None:
    classes, _ = _trees()
    assert list(classes) == ["mage"]
    assert [t.name for t in classes["mage"]] == ["Arcane", "Fire", "Frost"]
    assert classes["mage"][1].icon == 135810


def test_talents_are_in_tier_then_column_order() -> None:
    classes, _ = _trees()
    fire = classes["mage"][1]
    assert [(t.id, t.tier, t.column) for t in fire.talents] == [(3, 0, 0), (1, 0, 1), (2, 1, 0)]


def test_a_talent_takes_its_name_and_icon_from_any_rank_the_client_has() -> None:
    classes, gaps = _trees()
    fire = {t.id: t for t in classes["mage"][1].talents}
    assert fire[1].name == "Improved Fireball" and fire[1].icon == 135807
    assert fire[1].ranks == ("Reduces the casting time of your Fireball by 0.1 sec.", None, None, None, None)
    # Rank 1 of talent 2 is spell 101: a name, no description, no icon.
    assert fire[2].name == "Improved Fireball" and fire[2].icon == 0 and fire[2].ranks == (None, None)
    assert fire[2].prereqs == ((1, 5),)
    assert gaps.missing_ranks == 4 + 2 + 1


def test_a_talent_with_no_rank_in_the_client_takes_the_classic_name() -> None:
    classes, gaps = _trees(Fallback(names={200: "Burning Soul"}, icons={200: 135818}))
    talent = next(t for t in classes["mage"][1].talents if t.id == 3)
    assert (talent.name, talent.icon, talent.classic_name) == ("Burning Soul", 135818, True)
    assert gaps.nameless == [3]


def test_tab_of_an_unknown_class_is_skipped() -> None:
    classes, _ = _trees()
    assert all(t.id != 999 for trees in classes.values() for t in trees)


def test_every_classic_class_has_a_mask() -> None:
    assert sorted(CLASS_MASKS.values()) == ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"]


# --- the Classic comparison -------------------------------------------------


def _compare(forever_text: str, classic_text: str | None, forever_spell: int = 100) -> dict[int, list[str | None]]:
    forever = SpellBook(descriptions={forever_spell: forever_text}, names={forever_spell: "Talent"})
    classic = SpellBook(descriptions={} if classic_text is None else {100: classic_text})
    tabs = [_tab(41, "Fire", 128, 0)]
    gaps = Gaps()
    trees = build_trees(tabs, [_talent_row(1, 41, 0, 0, [100, 101])], forever, {}, gaps)["mage"]
    return classic_changes(trees, classic, gaps)


def test_a_changed_rank_carries_the_classic_text() -> None:
    assert _compare("Increases damage by 5%.", "Increases damage by 2%.") == {1: ["Increases damage by 2%.", None]}


def test_case_and_spacing_differences_are_not_changes() -> None:
    assert _compare("Increases  Damage by 5%.", "increases damage by 5%.") == {}


def test_a_rank_without_forever_text_is_not_compared() -> None:
    assert _compare("Increases damage by 5%.", "Increases damage by 2%.", forever_spell=999) == {}


def test_a_rank_without_classic_text_is_not_compared() -> None:
    assert _compare("Increases damage by 5%.", None) == {}


def test_a_forever_rank_with_an_unfillable_token_is_not_compared() -> None:
    assert _compare("Absorbs ${$SPFR} damage. Increases damage by 5%.", "Increases damage by 5%.") == {}


def test_a_classic_rank_with_an_unfillable_token_is_not_compared() -> None:
    assert _compare("Increases damage by 5%.", "Increases damage by $s1%.") == {}


# --- the committed output ---------------------------------------------------


def _class_files() -> list[Path]:
    files = sorted(TALENTS_DIR.glob("*.json"))
    assert files, "run python -m scripts.wow_talents.build"
    return files


def test_every_class_has_three_trees_on_the_in_game_grid() -> None:
    files = _class_files()
    assert sorted(f.stem for f in files) == sorted(CLASS_MASKS.values())
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        assert doc["clientBuild"] == WAGO_BUILD
        assert doc["classId"] == path.stem
        assert len(doc["trees"]) == 3
        for tree in doc["trees"]:
            places = [(t["tier"], t["column"]) for t in tree["talents"]]
            assert len(places) == len(set(places)), f"{path.stem} {tree['name']}: two talents share a cell"
            assert all(0 <= tier < TIERS and 0 <= col < COLUMNS for tier, col in places)
            assert all(t["name"] for t in tree["talents"]), f"{path.stem} {tree['name']}: a talent has no name"


def test_prerequisites_are_talents_of_the_same_tree_no_lower_down() -> None:
    for path in _class_files():
        for tree in json.loads(path.read_text(encoding="utf-8"))["trees"]:
            by_id = {t["id"]: t for t in tree["talents"]}
            for talent in tree["talents"]:
                for required, rank in talent["prereqs"]:
                    assert required in by_id, f"{talent['name']} needs a talent outside its tree"
                    before = by_id[required]
                    # Mostly straight down; a few point across a tier (Vampiric Embrace) or round a corner.
                    assert (before["tier"], before["column"]) != (talent["tier"], talent["column"])
                    assert before["tier"] <= talent["tier"]
                    assert 1 <= rank <= len(by_id[required]["ranks"])


def test_classic_files_name_talents_of_their_class_rank_for_rank() -> None:
    assert (CLASSIC_DIR / "LICENSE").is_file() and (CLASSIC_DIR / "README.md").is_file()
    for path in _class_files():
        talents = {t["id"]: t for tree in json.loads(path.read_text(encoding="utf-8"))["trees"] for t in tree["talents"]}
        classic = json.loads((CLASSIC_DIR / path.name).read_text(encoding="utf-8"))["talents"]
        for talent_id, ranks in classic.items():
            talent = talents[int(talent_id)]
            assert len(ranks) == len(talent["ranks"])
            assert any(ranks)
            for forever, was in zip(talent["ranks"], ranks):
                assert was is None or forever is not None


@pytest.mark.parametrize(("class_id", "name", "tier"), [("warrior", "Mortal Strike", 6), ("mage", "Arcane Focus", 0), ("druid", "Moonkin Form", 6)])
def test_known_talents_sit_where_they_do_in_game(class_id: str, name: str, tier: int) -> None:
    doc = json.loads((TALENTS_DIR / f"{class_id}.json").read_text(encoding="utf-8"))
    assert any(t["name"] == name and t["tier"] == tier for tree in doc["trees"] for t in tree["talents"])
