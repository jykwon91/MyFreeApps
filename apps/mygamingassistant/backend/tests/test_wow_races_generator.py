"""The races page generator (``scripts/wow_races``): racial lines, grouping, pairing and statuses."""
from __future__ import annotations

import json

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_food.tooltip import Effect, SpellBook
from scripts.wow_macros.build import CLASS_MASKS
from scripts.wow_races.build import build_races, racial_doc
from scripts.wow_races.races import (
    FACTION_ALLIANCE,
    FACTION_HORDE,
    PlayableRace,
    classic_start_zones,
    playable_races,
    race_classes,
    race_order,
)
from scripts.wow_races.racials import (
    STATUS_CHANGED,
    STATUS_NEW,
    STATUS_REMOVED,
    STATUS_UNCHANGED,
    Racial,
    RacialSpell,
    Variant,
    class_slugs,
    group_racials,
    line_races,
    pair_racials,
    passive_spells,
    race_mask,
    racial_lines,
    racial_spells,
    racial_status,
    slug,
    spell_text,
)

RACES_JSON = WOW_DATA_DIR / "races" / "races.json"
CLASSIC_JSON = WOW_DATA_DIR / "races" / "classic" / "racials.json"
ALL = frozenset({"warrior", "rogue", "mage"})


def _effect(base: float) -> Effect:
    return Effect(index=0, effect=6, aura=0, base_points=base, misc=0, period_ms=0, trigger=0)


def _book(texts: dict[int, str], bases: dict[int, float] | None = None) -> SpellBook:
    return SpellBook(
        descriptions=texts,
        effects={spell: [_effect(base)] for spell, base in (bases or {}).items()},
    )


def _racial(name: str, *variants: tuple[tuple[str, ...] | None, str, int]) -> Racial:
    return Racial(name, "passive", 1, [Variant(classes, text, (spell,), True) for classes, text, spell in variants])


def test_slug() -> None:
    assert slug("Artisan's Precision") == "artisans-precision"
    assert slug("Night Elf") == "night-elf"
    assert slug("Eureka!") == "eureka"


def test_race_mask_joins_the_two_halves_and_falls_back_to_the_old_column() -> None:
    assert race_mask({"RaceMasks_0": "2", "RaceMasks_1": "1"}) == 2 | (1 << 32)
    assert race_mask({"RaceMasks_0": "-1", "RaceMasks_1": "0"}) == 0xFFFFFFFF
    assert race_mask({"RaceMask": "8"}) == 8


def test_class_slugs() -> None:
    assert class_slugs(0) is None
    assert class_slugs(-1) is None
    assert class_slugs(CLASS_MASKS["mage"] | CLASS_MASKS["rogue"]) == {"mage", "rogue"}


def test_racial_lines_need_the_racial_flag() -> None:
    lines = [
        {"ID": "101", "CategoryID": "9", "Flags": "146"},  # Dwarven Racial
        {"ID": "762", "CategoryID": "9", "Flags": "144"},  # Riding
        {"ID": "7", "CategoryID": "7", "Flags": "2"},  # a class line
    ]
    assert racial_lines(lines) == {101}


def test_line_races_reads_the_owners_from_the_race_mask() -> None:
    bits = {3: 1 << 2, 7: 1 << 6, 95: 1 << 30}
    rows = [
        {"SkillID": "101", "RaceMasks_0": str(1 << 2)},
        {"SkillID": "2980", "RaceMasks_0": str((1 << 6) | (1 << 30))},
        {"SkillID": "999", "RaceMasks_0": "-1"},
    ]
    assert line_races(rows, {101, 2980}, bits) == {101: {3}, 2980: {7, 95}}


def test_racial_spells_narrow_by_the_rows_race_mask_and_skip_helpers() -> None:
    bits = {95: 1 << 30, 96: 1 << 31}
    owners = {2980: {95, 96}}
    abilities = [
        {"SkillLine": "2980", "Spell": "1", "RaceMasks_0": str(1 << 30), "ClassMask": "0"},
        {"SkillLine": "2980", "Spell": "2", "RaceMasks_0": str(1 << 31), "ClassMask": "0"},
        {"SkillLine": "2980", "Spell": "3", "RaceMasks_0": "0", "ClassMask": str(CLASS_MASKS["mage"])},
        {"SkillLine": "2980", "Spell": "4", "RaceMasks_0": "0", "ClassMask": "0"},  # no tooltip
    ]
    names = {1: "Read Leyline", 2: "Skysight", 3: "Shared", 4: "Quickness Passive"}
    descriptions = {1: "a", 2: "b", 3: "c", 4: ""}
    got = racial_spells(abilities, owners, bits, names, descriptions)
    assert [(s.race, s.spell) for s in got] == [(95, 1), (96, 2), (95, 3), (96, 3)]
    assert got[2].classes == {"mage"}


def test_spell_text_marks_a_value_the_files_dont_hold() -> None:
    book = _book({1: "Stuns up to $i enemies for 2 sec.", 2: "Health increased by $s1%."}, {2: 5})
    assert spell_text(book, 1) == ("Stuns up to ? enemies for 2 sec.", False)
    assert spell_text(book, 2) == ("Health increased by 5%.", True)


def test_group_racials_merges_same_text_and_drops_classes_the_race_cant_be() -> None:
    book = _book({1: "Fast.", 2: "Fast.", 3: "Slow.", 4: "Arcane."})
    spells = [
        RacialSpell(1, 1, "Speed", frozenset({"warrior"})),
        RacialSpell(1, 2, "Speed", frozenset({"rogue"})),
        RacialSpell(1, 3, "Speed", frozenset({"mage"})),
        RacialSpell(1, 4, "Priestly", frozenset({"priest"})),  # not a class this race has
    ]
    racials = group_racials(spells, ALL, book, {1: True}, {2: 77})
    assert [r.name for r in racials] == ["Speed"]
    speed = racials[0]
    assert speed.kind == "passive"
    assert speed.icon == 77
    assert [(v.classes, v.text) for v in speed.variants] == [(("mage",), "Slow."), (("rogue", "warrior"), "Fast.")]


def test_group_racials_calls_a_version_for_every_class_classless() -> None:
    book = _book({1: "Same."})
    racials = group_racials([RacialSpell(1, 1, "Trait", ALL)], ALL, book, {}, {})
    assert racials[0].variants[0].classes is None
    assert racials[0].kind == "active"


def test_pair_racials_matches_by_spell_id_before_name() -> None:
    renamed = _racial("Ruthless", (None, "new text", 20597))
    kept = _racial("Perception", (None, "same", 20600))
    new = _racial("Brand New", (None, "x", 9))
    was_renamed = _racial("Sword Specialization", (None, "old text", 20597))
    was_kept = _racial("Perception", (None, "same", 20600))
    gone = _racial("Mace Specialization", (None, "y", 20864))
    pairs = pair_racials([renamed, kept, new], [was_kept, gone, was_renamed])
    assert pairs == [(renamed, was_renamed), (kept, was_kept), (new, None), (None, gone)]


def test_racial_status() -> None:
    same = _racial("A", (None, "Text.", 1))
    assert racial_status(same, None) == STATUS_NEW
    assert racial_status(None, same) == STATUS_REMOVED
    assert racial_status(same, _racial("A", (None, "text. ", 1))) == STATUS_UNCHANGED
    assert racial_status(same, _racial("B", (None, "Text.", 1))) == STATUS_CHANGED
    assert racial_status(same, _racial("A", (None, "Other.", 1))) == STATUS_CHANGED
    split = _racial("A", (("mage",), "Text.", 1), (("rogue",), "Text.", 2))
    assert racial_status(same, split) == STATUS_CHANGED


def test_passive_spells_reads_the_base_difficulty() -> None:
    misc = [
        {"SpellID": "1", "DifficultyID": "0", "Attributes_0": str(0x40)},
        {"SpellID": "2", "DifficultyID": "0", "Attributes_0": "16"},
        {"SpellID": "2", "DifficultyID": "1", "Attributes_0": str(0x40)},
    ]
    assert passive_spells(misc) == {1: True, 2: False}


def test_playable_races_and_order() -> None:
    classes = race_classes([
        {"RaceID": "1", "ClassID": "1"},
        {"RaceID": "1", "ClassID": "8"},
        {"RaceID": "2", "ClassID": "1"},
        {"RaceID": "95", "ClassID": "4"},
    ])
    assert classes == {1: {"warrior", "mage"}, 2: {"warrior"}, 95: {"rogue"}}
    rows = [
        {"ID": "1", "Name_lang": "Human", "Alliance": "0", "PlayableRaceBit": "0", "UiDisplayOrder": "1"},
        {"ID": "2", "Name_lang": "Orc", "Alliance": "1", "PlayableRaceBit": "1", "UiDisplayOrder": "0"},
        {"ID": "95", "Name_lang": "High Order Skyborne", "Alliance": "0", "PlayableRaceBit": "30", "UiDisplayOrder": "9"},
        {"ID": "33", "Name_lang": "Not playable", "Alliance": "0", "PlayableRaceBit": "5", "UiDisplayOrder": "0"},
    ]
    races = playable_races(rows, classes)
    assert set(races) == {1, 2, 95}
    assert races[95].bit == 1 << 30
    assert races[2].faction == FACTION_HORDE
    assert [r.id for r in sorted(races.values(), key=race_order)] == [1, 95, 2]
    assert [r.id for r in sorted(races.values(), key=lambda r: race_order(r, r.id == 95))] == [1, 95, 2]
    assert race_order(races[95], True) > race_order(PlayableRace(4, "Night Elf", FACTION_ALLIANCE, 8, 99))


def test_classic_start_zones_take_the_first_class_listed() -> None:
    rows = [{"race": 1, "zone": 12}, {"race": 1, "zone": 99}, {"race": 2, "zone": 14}]
    assert classic_start_zones(rows) == {1: 12, 2: 14}


def test_racial_doc_names_a_rename_and_a_partial_text() -> None:
    forever = _racial("Ruthless", (None, "Hits ?.", 1))
    forever.variants[0] = Variant(None, "Hits ?.", (1,), False)
    doc = racial_doc("human", forever, _racial("Sword Specialization", (None, "Old.", 1)), STATUS_CHANGED)
    assert doc["key"] == "human-ruthless"
    assert doc["wasName"] == "Sword Specialization"
    assert doc["partial"] is True
    gone = racial_doc("human", None, _racial("Diplomacy", (None, "Rep.", 2)), STATUS_REMOVED)
    assert gone["variants"] == []
    assert gone["name"] == "Diplomacy"


def test_build_races_splits_the_forever_and_classic_sides() -> None:
    human = PlayableRace(1, "Human", FACTION_ALLIANCE, 1, 1)
    sky = PlayableRace(95, "High Order Skyborne", FACTION_ALLIANCE, 1 << 30, 9)
    races, classic = build_races(
        {1: human, 95: sky},
        {1: frozenset({"warrior", "hunter"}), 95: frozenset({"rogue"})},
        {1: frozenset({"warrior"})},
        {1: [_racial("Perception", (None, "New.", 7))], 95: [_racial("Read Leyline", (None, "Ley.", 8))]},
        {1: [_racial("Perception", (None, "Old.", 7)), _racial("Diplomacy", (None, "Rep.", 9))]},
        {1: "Elwynn Forest"},
        {"Elwynn Forest": 1429},
        {2521: "Zephras Isle"},
    )
    human_doc, sky_doc = races
    assert human_doc["newClasses"] == ["hunter"]
    assert [(r["name"], r["status"]) for r in human_doc["racials"]] == [("Perception", "changed"), ("Diplomacy", "removed")]
    assert sky_doc["newInForever"] is True
    assert sky_doc["newClasses"] == []
    assert sky_doc["startZone"] == {"name": "Zephras Isle", "uiMapId": 2521}
    assert classic == {"1": {
        "racials": {
            "human-perception": {"variants": [{"classes": None, "text": "Old."}]},
            "human-diplomacy": {"variants": [{"classes": None, "text": "Rep."}]},
        },
        "startZone": {"name": "Elwynn Forest", "uiMapId": 1429},
    }}


def test_committed_output_is_consistent() -> None:
    doc = json.loads(RACES_JSON.read_text(encoding="utf-8"))
    classic = json.loads(CLASSIC_JSON.read_text(encoding="utf-8"))["races"]
    racials = [r for race in doc["races"] for r in race["racials"]]
    assert doc["counts"]["races"] == len(doc["races"])
    assert doc["counts"]["racials"] == len(racials)
    keys = [r["key"] for r in racials]
    assert len(keys) == len(set(keys))
    for race in doc["races"]:
        side = classic.get(str(race["id"]), {}).get("racials", {})
        for r in race["racials"]:
            needs_classic = r["status"] in (STATUS_CHANGED, STATUS_REMOVED)
            assert (r["key"] in side) == needs_classic, r["key"]
            assert bool(r["variants"]) == (r["status"] != STATUS_REMOVED), r["key"]
        assert ("startZone" in race) == race["newInForever"]
    # The Forever-only races (High Order / Windshaper Skyborne) and their faction-only actives.
    skyborne = {race["name"]: race for race in doc["races"] if race["newInForever"]}
    assert set(skyborne) == {"High Order Skyborne", "Windshaper Skyborne"}
    assert any(r["name"] == "Read Leyline" for r in skyborne["High Order Skyborne"]["racials"])
    assert not any(r["name"] == "Read Leyline" for r in skyborne["Windshaper Skyborne"]["racials"])
