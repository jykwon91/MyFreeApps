"""The WoW Forever Spellbook's generator: which client spells are kept, rank order, how Classic teaches a
spell (trainer cost, quest, book), the Classic fallbacks, and the committed output. Fixtures are synthetic
rows, never the network."""
from __future__ import annotations

import json

from scripts.wow_icons.build import OUT_FILE as ICON_MAP_FILE
from scripts.wow_icons.build import spellbook_icon_files
from scripts.wow_macros.build import CLASS_LINES
from scripts.wow_spellbook.build import CLASSIC_DIR, SPELLBOOK_DIR, TALENTS_DIR
from scripts.wow_spellbook.demons import DEMON_LINES, demon_docs, grimoire_items
from scripts.wow_spellbook.docs import ChangeInfo, ClassicFill, FieldCounts, change_info, spell_doc
from scripts.wow_spellbook.spells import (
    ACQUIRE_ON_LEARN,
    ACQUIRE_OTHER_WAY,
    ALL_RACES,
    ATTR0_HIDDEN,
    ATTR0_PASSIVE,
    Learned,
    Rank,
    Spell,
    SpellFacts,
    SpellGaps,
    class_spells,
    races_of,
    rank_number,
    talent_spells,
)
from scripts.wow_spellbook.trainers import EFFECT_LEARN_SPELL, book_spells, quest_spells, teaching_map, trainer_costs
from scripts.wow_world_map.sources import WAGO_BUILD

FIRE_LINE = 593
LINE_CLASS = {FIRE_LINE: "warlock"}


def _facts(**spells: tuple[str, str, int, int | None]) -> SpellFacts:
    """``s<id>=(name, subtext, attributes, level)``."""
    rows = {int(k[1:]): v for k, v in spells.items()}
    return SpellFacts(
        names={s: v[0] for s, v in rows.items()},
        subtexts={s: v[1] for s, v in rows.items()},
        attributes={s: v[2] for s, v in rows.items()},
        levels={s: v[3] for s, v in rows.items() if v[3]},
        icons={s: 1000 + s for s in rows},
    )


def _ability(spell: int, acquire: int = 0, races: int = 0) -> dict[str, str]:
    return {"SkillLine": str(FIRE_LINE), "Spell": str(spell), "AcquireMethod": str(acquire), "RaceMasks_0": str(races)}


def _spells(abilities, facts, classic=frozenset(), learned=Learned(), gaps=None):
    return class_spells(abilities, LINE_CLASS, facts, frozenset(classic), learned, gaps or SpellGaps())


# --- small readers -----------------------------------------------------------


def test_rank_number_reads_rank_subtexts_only() -> None:
    assert rank_number("Rank 3") == 3
    assert rank_number(" Rank 12 ") == 12
    assert rank_number("Summon") == 0
    assert rank_number("") == 0


def test_races_of_reads_the_race_mask() -> None:
    assert races_of(0) == ALL_RACES
    assert races_of(-1) == ALL_RACES
    assert races_of(1 | 4) == {1, 3}  # Human, Dwarf
    assert races_of(128) == {8}  # Troll


# --- which spells are kept ---------------------------------------------------


def test_trained_ranks_group_by_name_in_rank_order() -> None:
    facts = _facts(
        s707=("Immolate", "Rank 2", 0, 10),
        s348=("Immolate", "Rank 1", 0, 1),
        s1094=("Immolate", "Rank 3", 0, 20),
    )
    learned = Learned(trainer=frozenset({348, 707, 1094}))
    (spell,) = _spells([_ability(707), _ability(348), _ability(1094)], facts, {348, 707, 1094}, learned)
    assert spell.name == "Immolate"
    assert [r.spell for r in spell.ranks] == [348, 707, 1094]
    assert spell.icon == 1000 + 1094  # the highest rank's icon
    assert spell.races == ALL_RACES


def test_season_of_discovery_runes_hidden_spells_and_placeholders_are_left_out() -> None:
    facts = _facts(
        s1=("Rune Copy", "", 0, 1),
        s2=("Hidden", "", ATTR0_HIDDEN, 1),
        s3=("Old Thing (DND)", "", 0, 1),
    )
    gaps = SpellGaps()
    assert _spells([_ability(1, ACQUIRE_OTHER_WAY), _ability(2), _ability(3)], facts, gaps=gaps) == []
    assert gaps.untaught == [] and gaps.not_in_client == []


def test_a_spell_the_client_has_no_row_for_is_counted_never_guessed() -> None:
    gaps = SpellGaps()
    assert _spells([_ability(99)], _facts(), gaps=gaps) == []
    assert gaps.not_in_client == [99]


def test_a_classic_spell_needs_something_that_teaches_it() -> None:
    facts = _facts(
        s10=("Pyroclasm", "", 0, 20),  # a talent's proc effect: in 1.12, nothing teaches it
        s11=("Trained", "Rank 1", 0, 4),
        s12=("Quest Demon", "Summon", 0, 30),
        s13=("Book Rank", "Rank 7", 0, 60),
        s14=("Given On Learn", "", 0, 1),
    )
    learned = Learned(trainer=frozenset({11}), quest=frozenset({12}), book=frozenset({13}))
    gaps = SpellGaps()
    abilities = [_ability(10), _ability(11), _ability(12), _ability(13), _ability(14, ACQUIRE_ON_LEARN)]
    kept = _spells(abilities, facts, {10, 11, 12, 13, 14}, learned, gaps)
    assert {s.name for s in kept} == {"Trained", "Quest Demon", "Book Rank", "Given On Learn"}
    assert gaps.untaught == [10]


def test_a_spell_new_in_forever_needs_a_level_or_a_talent() -> None:
    facts = _facts(s1000=("Bane of Agony", "Rank 1", 0, 8), s1001=("No Level", "", 0, None))
    gaps = SpellGaps()
    kept = _spells([_ability(1000), _ability(1001)], facts, gaps=gaps)
    assert [s.name for s in kept] == ["Bane of Agony"]
    assert gaps.untaught == [1001]


def test_talent_ranks_link_the_talent_and_passive_talents_are_left_out() -> None:
    facts = _facts(
        s17877=("Shadowburn", "Rank 1", 0, 20),
        s18867=("Shadowburn", "Rank 2", 0, 24),
        s18000=("Passive Talent", "", ATTR0_PASSIVE, None),
    )
    learned = Learned(trainer=frozenset({18867}), talent_of={17877: 963, 18000: 970})
    (spell,) = _spells([_ability(17877), _ability(18867), _ability(18000)], facts, {17877, 18867, 18000}, learned)
    assert spell.talent == 963
    assert [(r.spell, r.from_talent) for r in spell.ranks] == [(17877, True), (18867, False)]


def test_a_talent_the_live_trees_dropped_is_still_a_talent_but_links_nowhere() -> None:
    facts = _facts(s17877=("Dark Pact", "Rank 1", 0, 40))
    learned = Learned(talent_of={17877: None})
    (spell,) = _spells([_ability(17877)], facts, {17877}, learned)
    assert spell.talent is None
    assert spell.ranks[0].from_talent


def _client_talent(talent_id: int, *spells: int) -> dict[str, str]:
    return {"ID": str(talent_id), **{f"SpellRank_{i}": str(s) for i, s in enumerate(spells)}}


def test_talent_spells_link_every_client_rank_to_the_live_talent_sharing_a_spell() -> None:
    client = [_client_talent(963, 17877, 18867), _client_talent(970, 18000)]
    live = {17877: 135400, 412758: 135405}
    assert talent_spells(client, live) == {17877: 135400, 18867: 135400, 18000: None, 412758: 135405}


def test_race_only_ranks_union_their_races_and_level_less_spells_sort_last() -> None:
    facts = _facts(
        s1=("Racial", "", 0, 10),
        s2=("Racial", "", 0, 10),
        s3=("Talent Spell", "", 0, None),
        s4=("Early", "", 0, 2),
    )
    learned = Learned(trainer=frozenset({1, 2, 4}), talent_of={3: 5})
    kept = _spells([_ability(1, races=1), _ability(2, races=4), _ability(3), _ability(4)], facts, {1, 2, 3, 4}, learned)
    assert [s.name for s in kept] == ["Early", "Racial", "Talent Spell"]
    assert kept[1].races == {1, 3}


# --- how Classic teaches a spell ---------------------------------------------


def _effect(spell: int, effect: int, trigger: int) -> dict[str, str]:
    return {"SpellID": str(spell), "Effect": str(effect), "EffectTriggerSpell": str(trigger)}


def test_teaching_spells_map_to_what_they_teach() -> None:
    teaches = teaching_map([_effect(1, EFFECT_LEARN_SPELL, 348), _effect(2, 2, 999), _effect(3, EFFECT_LEARN_SPELL, 0)])
    assert teaches == {1: [348]}


def test_trainer_costs_take_the_lowest_class_trainer_price_and_skip_profession_rows() -> None:
    teaches = {5000: [707]}
    rows = [
        {"spell": 348, "spellcost": 10, "reqskill": 0},
        {"spell": 348, "spellcost": 8, "reqskill": 0},
        {"spell": 5000, "spellcost": 300, "reqskill": 0},  # the teaching spell, counted for 707 too
        {"spell": 2259, "spellcost": 10, "reqskill": 171},  # Alchemy
    ]
    costs = trainer_costs(rows, teaches)
    assert costs == {348: 8, 5000: 300, 707: 300}


def test_quest_and_book_spells() -> None:
    teaches = {7000: [688], 25982: [25311]}
    assert quest_spells([{"RewSpell": 7000, "RewSpellCast": 0}, {"RewSpell": 0, "RewSpellCast": 1122}], teaches) == {
        7000, 688, 1122,
    }
    items = [
        {"class": 9, "subclass": 0, "spellid_1": 25982},  # Grimoire of Corruption VII
        {"class": 9, "subclass": 2, "spellid_1": 7000},  # a profession recipe, not a class book
        {"class": 0, "subclass": 0, "spellid_1": 7000},  # a potion
    ]
    assert book_spells(items, teaches) == {25311}


# --- documents ---------------------------------------------------------------


def _rank(spell: int, rank: str = "", level: int | None = None, talent: bool = False) -> Rank:
    return Rank(spell=spell, rank=rank, level=level, passive=False, from_talent=talent)


def test_change_info_keeps_changed_rank_labels_only_for_changed_spells() -> None:
    entries = [
        {"key": "spell:warlock:Shadow Bolt", "kind": "changed", "rows": [["Rank 1", "a", "b"]]},
        {"key": "spell:warlock:Bane of Agony", "kind": "new", "rows": [["Rank 1", None, "x"]]},
    ]
    info = change_info(entries)
    assert info["spell:warlock:Shadow Bolt"] == ChangeInfo("changed", frozenset({"Rank 1"}))
    assert info["spell:warlock:Bane of Agony"] == ChangeInfo("new")


def test_spell_doc_uses_forever_first_and_classic_only_by_the_same_spell_id() -> None:
    spell = Spell(
        class_id="warlock",
        name="Shadow Bolt",
        tab=FIRE_LINE,
        ranks=(_rank(686, "Rank 1", 1), _rank(695, "Rank 2", None), _rank(1311676, "Rank 3", 12), _rank(9, "", 30)),
        races=frozenset({1}),
        talent=None,
        icon=136197,
    )
    fill, counts = ClassicFill(), FieldCounts()
    doc = spell_doc(
        spell,
        forever_text={686: "Forever text."}.get,
        classic_text={695: "Classic text."}.get,
        classic_level={695: 6},
        costs={686: 10, 695: 100},
        quests={1311676},
        books={9},
        changes={"spell:warlock:Shadow Bolt": ChangeInfo("changed", frozenset({"Rank 1"}))},
        downrank={("warlock", "Shadow Bolt"): "warlock-shadow-bolt"},
        fill=fill,
        counts=counts,
    )
    assert doc["id"] == 686 and doc["races"] == [1] and doc["downrank"] == "warlock-shadow-bolt"
    assert doc["changed"] == "changed"
    first, second, third, fourth = doc["ranks"]
    assert first == {"spell": 686, "rank": "Rank 1", "level": 1, "text": "Forever text.", "changed": True}
    assert second == {"spell": 695, "rank": "Rank 2"}  # level + text come from Classic, in the classic file
    assert "text" not in third and "level" in third
    assert fourth == {"spell": 9, "level": 30}
    assert fill.costs == {686: 10, 695: 100}
    assert fill.texts == {695: "Classic text."} and fill.levels == {695: 6}
    assert fill.quests == {1311676} and fill.books == {9}
    assert (counts.ranks, counts.text_classic, counts.text_blank, counts.level_classic) == (4, 1, 2, 1)
    assert (counts.cost_known, counts.quest, counts.book) == (2, 1, 1)


def test_a_talent_rank_never_gets_a_trainer_cost() -> None:
    spell = Spell("warlock", "Shadowburn", FIRE_LINE, (_rank(17877, "Rank 1", 20, talent=True),), ALL_RACES, 963, 1)
    fill = ClassicFill()
    doc = spell_doc(
        spell, {}.get, {}.get, {}, {17877: 500}, set(), set(), {}, {}, fill, FieldCounts(),
    )
    assert doc["talent"] == 963 and doc["ranks"][0]["talent"] is True
    assert "level" not in doc["ranks"][0]  # the talent tree decides when it opens, not its spell level
    assert "races" not in doc and fill.costs == {}


# --- the committed output ----------------------------------------------------


def _committed(class_id: str) -> dict:
    return json.loads((SPELLBOOK_DIR / f"{class_id}.json").read_text(encoding="utf-8"))


def test_committed_output_has_every_class_with_tabs_and_ranks() -> None:
    assert (CLASSIC_DIR / "LICENSE").is_file() and (CLASSIC_DIR / "README.md").is_file()
    for class_id, lines in CLASS_LINES.items():
        doc = _committed(class_id)
        assert doc["clientBuild"] == WAGO_BUILD and doc["classId"] == class_id
        assert [t["id"] for t in doc["tabs"]] == list(lines)
        assert len(doc["spells"]) > 30, class_id
        ids = [s["id"] for s in doc["spells"]]
        assert len(ids) == len(set(ids)), class_id
        for spell in doc["spells"]:
            assert spell["tab"] in lines and spell["ranks"], spell["name"]
            assert spell["id"] == spell["ranks"][0]["spell"]
            assert not any(r.get("talent") and "level" in r for r in spell["ranks"]), spell["name"]
        classic = json.loads((CLASSIC_DIR / f"{class_id}.json").read_text(encoding="utf-8"))
        assert set(classic) == {"source", "classId", "costs", "quests", "books", "texts", "levels"}


def test_committed_warlock_spells_match_the_forever_client() -> None:
    spells = {s["name"]: s for s in _committed("warlock")["spells"]}
    bolt = spells["Shadow Bolt"]
    assert bolt["downrank"] == "warlock-shadow-bolt" and bolt["changed"] == "changed"
    assert bolt["ranks"][0]["text"] == "Sends a shadowy bolt at the enemy, causing 11 to 15 Shadow damage."
    assert spells["Shadowburn"]["talent"] == 135415  # the live tree's id (Blizzard's Game Data API)
    assert spells["Wrack"]["talent"] == 135440 and "changed" not in spells["Wrack"]  # a Forever talent, not a new spell
    assert spells["Bane of Agony"]["changed"] == "new"
    assert "Curse of Agony" not in spells  # Forever renamed Curses to Banes
    classic = json.loads((CLASSIC_DIR / "warlock.json").read_text(encoding="utf-8"))
    assert classic["costs"]["172"] == 100  # Corruption Rank 1: 1 silver at a Classic trainer
    assert 25311 in classic["books"]  # Grimoire of Corruption VII


def test_every_spellbook_talent_link_is_a_live_talent() -> None:
    for class_id in CLASS_LINES:
        trees = json.loads((TALENTS_DIR / f"{class_id}.json").read_text(encoding="utf-8"))["trees"]
        live = {t["id"] for tree in trees for t in tree["talents"]}
        linked = {s["talent"] for s in _committed(class_id)["spells"] if "talent" in s}
        assert linked and linked <= live, class_id


def test_every_spellbook_icon_is_in_the_icon_map() -> None:
    wanted = spellbook_icon_files()
    assert wanted
    files = set(json.loads(ICON_MAP_FILE.read_text(encoding="utf-8"))["files"])
    assert wanted <= files, "re-run python -m scripts.wow_icons.build"


# --- the Warlock's demons --------------------------------------------------------

IMP_LINE = 188


def _demon_row(spell: int, acquire: int = 0, line: int = IMP_LINE) -> dict[str, str]:
    return {"SkillLine": str(line), "Spell": str(spell), "AcquireMethod": str(acquire)}


def test_grimoires_map_ability_and_rank_to_the_item() -> None:
    items = [
        {"ID": "16302", "Display_lang": "Grimoire of Firebolt (Rank 2)"},
        {"ID": "16331", "Display_lang": "Grimoire of Phase Shift"},
        {"ID": "1238", "Display_lang": "Grimoire of Fear"},
        {"ID": "5", "Display_lang": "Linen Cloth"},
    ]
    assert grimoire_items(items) == {("Firebolt", "Rank 2"): 16302, ("Phase Shift", ""): 16331, ("Fear", ""): 1238}


def test_demon_docs_group_ranks_by_ability_mark_summon_ranks_and_link_grimoires() -> None:
    facts = _facts(
        s7799=("Firebolt", "Rank 2", 0, 8),
        s3110=("Firebolt", "Rank 1", 0, 1),
        s4511=("Phase Shift", "", 0, 12),
        s18728=("Tamed Pet Passive (DND)", "", 0, None),
        s416189=("Warlock Pet Scaling", "", ATTR0_HIDDEN, 1),
        s19658=("Devour Magic Effect", "Rank 1", 0, 30),
    )
    rows = [
        _demon_row(7799), _demon_row(3110, ACQUIRE_ON_LEARN), _demon_row(4511), _demon_row(18728, ACQUIRE_ON_LEARN),
        _demon_row(416189, ACQUIRE_ON_LEARN), _demon_row(19658, line=189), _demon_row(3110, line=FIRE_LINE),
    ]
    grimoires = {("Firebolt", "Rank 2"): 16302, ("Phase Shift", ""): 16331}
    demons = demon_docs(rows, facts, grimoires, {7799: "Deals 10 to 12 Fire damage to a target."})
    assert [d["name"] for d in demons] == list(DEMON_LINES.values())
    imp = demons[0]
    assert imp == {"line": IMP_LINE, "name": "Imp", "abilities": [
        {"name": "Firebolt", "icon": 1000 + 3110, "ranks": [
            {"spell": 3110, "level": 1, "rank": "Rank 1", "known": True},
            {"spell": 7799, "level": 8, "rank": "Rank 2", "text": "Deals 10 to 12 Fire damage to a target.", "grimoire": 16302},
        ]},
        {"name": "Phase Shift", "icon": 1000 + 4511, "ranks": [{"spell": 4511, "level": 12, "grimoire": 16331}]},
    ]}
    assert all(not d["abilities"] for d in demons[1:])  # the Effect spell is left out


def test_committed_warlock_demons_match_the_forever_client() -> None:
    demons = {d["name"]: {a["name"]: a for a in d["abilities"]} for d in _committed("warlock")["demons"]}
    assert set(demons) == {"Imp", "Voidwalker", "Succubus", "Felhunter"}
    firebolt = demons["Imp"]["Firebolt"]["ranks"]
    assert [r["level"] for r in firebolt] == [1, 8, 18, 28, 38, 48, 58]
    assert firebolt[0].get("known") and firebolt[1]["grimoire"] == 16302
    assert demons["Felhunter"]["Spell Lock"]["ranks"][0] == {
        **demons["Felhunter"]["Spell Lock"]["ranks"][0], "level": 36, "grimoire": 16388,
    }
    ranks = [r for abilities in demons.values() for a in abilities.values() for r in a["ranks"]]
    assert all(("known" in r) != ("grimoire" in r) for r in ranks)
    assert "demons" not in _committed("mage")
