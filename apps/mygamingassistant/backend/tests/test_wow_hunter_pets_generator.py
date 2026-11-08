"""The Hunter pets guide's generator (``scripts/wow_hunter_pets``) and its committed output."""
from __future__ import annotations

import json
import struct
from typing import Any

from scripts.wow_hunter_pets.abilities import build_abilities
from scripts.wow_hunter_pets.beasts import (
    classic_beasts,
    pet_spell_lists,
    seen_beasts,
    spawn_zones,
    tamable_templates,
)
from scripts.wow_hunter_pets.build import BEASTS_PATH, FOREVER_PATH
from scripts.wow_hunter_pets.families import (
    build_families,
    diet_names,
    family_passives,
    passive_modifiers,
    slugify,
)
from scripts.wow_rares.creature_cache import CachedCreature, CreatureCache, parse_creature_cache

FOODS = [
    {"ID": "1", "Name_lang": "Meat"},
    {"ID": "2", "Name_lang": "Fish"},
    {"ID": "3", "Name_lang": "Cheese"},
]


def _family(fid: int, name: str, line: int, second_line: int = 0, mask: int = 1) -> dict[str, str]:
    return {
        "ID": str(fid), "Name_lang": name, "PetFoodMask": str(mask), "IconFileID": "100",
        "SkillLine_0": str(line), "SkillLine_1": str(second_line),
    }


def _effect(spell: int, aura: str, points: str, misc: str = "1") -> dict[str, str]:
    return {"SpellID": str(spell), "EffectAura": aura, "EffectBasePointsF": points, "EffectMiscValue_0": misc}


def _given(spell: int, line: int) -> dict[str, str]:
    return {"Spell": str(spell), "SkillLine": str(line), "AcquireMethod": "2"}


def _taught(spell: int, line: int) -> dict[str, str]:
    return {"Spell": str(spell), "SkillLine": str(line), "AcquireMethod": "1"}


# --- families ---------------------------------------------------------------


def test_diet_is_the_foods_whose_bit_is_set() -> None:
    assert diet_names(0b101, FOODS) == ["Meat", "Cheese"]
    assert diet_names(0, FOODS) == []


def test_slug_is_lowercase_and_hyphenated() -> None:
    assert slugify("Bird of Prey") == "bird-of-prey"


def test_passive_modifiers_read_damage_armor_and_health() -> None:
    effects = [
        _effect(10, "79", "-9.0"), _effect(10, "142", "5.0"), _effect(10, "133", "8.0"),
        _effect(11, "79", "7.0", misc="2"),
    ]
    assert passive_modifiers(effects, 10) == (-9, 5, 8)
    assert passive_modifiers(effects, 11) is None


def test_family_passive_is_the_one_given_on_a_subset_of_lines() -> None:
    rows = [_given(1, 10), _given(1, 20), _given(1, 30), _given(7, 10), _given(8, 20), _given(8, 30)]
    # Spell 1 is on every line (shared); 7 is line 10's own; 8 is shared by 20 and 30.
    assert family_passives(rows, [10, 20, 30]) == {10: 7, 20: 8, 30: 8}


def test_build_families_adds_the_forever_only_family_and_keeps_the_classic_list() -> None:
    forever = [
        _family(1, "Wolf", 208, mask=1), _family(2, "Cat", 209, mask=3),
        _family(319, "Fox", 3016, second_line=270), _family(30, "Core Hound", 999),
    ]
    rows = [_given(1, 208), _given(1, 209), _given(1, 3016), _given(5, 208), _given(5, 3016), _given(6, 209)]
    effects = [
        _effect(5, "79", "0"), _effect(5, "142", "5"), _effect(5, "133", "0"),
        _effect(6, "79", "10"), _effect(6, "142", "0"), _effect(6, "133", "-2"),
    ]
    families = build_families(forever, {1, 2, 30}, FOODS, rows, effects)
    assert [f.name for f in families] == ["Cat", "Fox", "Wolf"]
    cat, fox, wolf = families
    assert (cat.damage, cat.armor, cat.health, cat.diet) == (10, 0, -2, ["Meat", "Fish"])
    assert (fox.is_new, fox.armor) == (True, 5)
    assert wolf.is_new is False


# --- abilities --------------------------------------------------------------


def test_abilities_group_ranks_by_name_and_skip_given_and_unleveled_spells() -> None:
    rows = [
        _taught(1, 208), _taught(2, 208), _taught(2, 209), _taught(3, 270),
        _given(4, 208), _taught(5, 208), _taught(6, 208), _taught(7, 999),
    ]
    names = {1: "Bite", 2: "Bite", 3: "Growl", 4: "Tamed Pet Passive (DND)", 5: "Faster Attack I", 6: "Dash", 7: "Nope"}
    levels = {1: 8, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0, 7: 1}
    abilities = build_abilities(rows, [208, 209], levels, names, {1, 2, 3})
    assert [a.name for a in abilities] == ["Bite", "Growl"]
    bite = abilities[0]
    assert [(r.spell, r.level) for r in bite.ranks] == [(2, 1), (1, 8)]
    assert bite.lines == {208, 209}
    assert bite.ranks[0].lines == {208, 209}
    assert bite.is_new is False


def test_a_rank_no_classic_line_lists_is_new() -> None:
    rows = [_taught(1, 208), _taught(2, 208)]
    abilities = build_abilities(rows, [208], {1: 1, 2: 60}, {1: "Thunderstomp", 2: "Thunderstomp"}, {1})
    ranks = abilities[0].ranks
    assert [r.is_new for r in ranks] == [False, True]
    assert abilities[0].is_new is False


# --- beasts -----------------------------------------------------------------


def _template(entry: int, name: str, family: int, *, kind: int = 1, flags: int = 1, pet_data: int = 0) -> dict[str, Any]:
    return {
        "Entry": entry, "Name": name, "CreatureType": kind, "CreatureTypeFlags": flags, "Family": family,
        "MinLevel": 5, "MaxLevel": 6, "MeleeBaseAttackTime": 2000, "PetSpellDataId": pet_data,
    }


def test_only_tameable_beasts_of_the_listed_families_count() -> None:
    templates = [
        _template(1, "Wolf", 1),
        _template(2, "Not tameable", 1, flags=0),
        _template(3, "Humanoid", 1, kind=7),
        _template(4, "Other family", 99),
    ]
    assert [t["Entry"] for t in tamable_templates(templates, {1})] == [1]


def test_spawn_zones_rank_by_count_and_drop_event_spawns_and_unplaced_ones() -> None:
    def spawn(guid: int, creature: int, map_id: int) -> dict[str, Any]:
        return {"guid": guid, "id": creature, "map": map_id, "position_x": 1.0, "position_y": 2.0}

    spawns = [spawn(1, 10, 0), spawn(2, 10, 0), spawn(3, 10, 1), spawn(4, 10, 43), spawn(5, 10, 0), spawn(6, 11, 0)]

    def placer(continent: int, wx: float, wy: float) -> list[Any] | None:
        return [1000 + continent, "", 0, 0] if continent == 0 else None

    zones = spawn_zones(spawns, {10, 11}, {5}, placer)
    # Map 0 twice (guid 5 is event-only), map 1 can't be placed, map 43 is an instance.
    assert zones[10] == ["1000", "m43"]
    assert zones[11] == ["1000"]


def test_classic_beasts_keep_only_known_ability_spells_and_report_the_unspawned() -> None:
    templates = [_template(1, "Wolf", 1, pet_data=7), _template(2, "Ghost", 1)]
    pet_spells = pet_spell_lists([
        {"ID": "7", "Spells_0": "24450", "Spells_1": "99", "Spells_2": "0", "Spells_3": "0"},
    ])
    kept, dropped = classic_beasts(templates, {1: ["1411"]}, pet_spells, {24450})
    assert [b.id for b in kept] == [1] and dropped == [2]
    assert kept[0].teaches == [24450]
    assert kept[0].zones == ["1411"]


def test_seen_beasts_are_the_tameable_beasts_the_client_has_met() -> None:
    cache = CreatureCache(build=1, creatures={
        1: CachedCreature(1, "Gray Fox", 0, creature_type=1, family=319, tameable=True),
        2: CachedCreature(2, "Generic Hunter Pet", 0, creature_type=1, family=1, tameable=True),
        3: CachedCreature(3, "Villager", 0, creature_type=7, family=0, tameable=False),
        4: CachedCreature(4, "Other", 0, creature_type=1, family=99, tameable=True),
        5: CachedCreature(5, "Bear", 0, creature_type=1, family=4, tameable=False),
    })
    assert [c.name for c in seen_beasts(cache, {1, 319, 4})] == ["Gray Fox"]


def _pack_bits(fields: list[tuple[int, int]], size: int) -> bytes:
    value = 0
    used = 0
    for number, width in fields:
        value = (value << width) | number
        used += width
    value <<= size * 8 - used
    return value.to_bytes(size, "big")


def test_creature_cache_reads_type_family_and_the_tameable_flag() -> None:
    names = [b"Gray Fox\0"] + [b""] * 7
    header = _pack_bits([(0, 11), (0, 11), (0, 6), (0, 1)] + [(len(n), 11) for n in names], 15)
    tail = bytearray(40)
    tail[0] = 1
    tail[12] = 1
    tail[13:15] = (319).to_bytes(2, "little")
    blob = struct.pack("<4sI4sIII", b"BOMW", 70862, b"SUne", 0, 0, 0)
    body = header + b"".join(names) + bytes(tail)
    blob += struct.pack("<II", 7, len(body)) + body + struct.pack("<II", 0, 0)
    fox = parse_creature_cache(blob).creatures[7]
    assert (fox.creature_type, fox.family, fox.tameable) == (1, 319, True)


# --- the committed output ---------------------------------------------------


def _forever() -> dict[str, Any]:
    return json.loads(FOREVER_PATH.read_text(encoding="utf-8"))


def _classic() -> dict[str, Any]:
    return json.loads(BEASTS_PATH.read_text(encoding="utf-8"))


def test_committed_families_have_modifiers_and_a_diet() -> None:
    families = _forever()["families"]
    assert len(families) == 18
    assert {f["name"] for f in families} >= {"Wolf", "Cat", "Fox", "Bird of Prey"}
    assert all(f["diet"] and f["damage"] is not None for f in families)
    cat = next(f for f in families if f["name"] == "Cat")
    assert (cat["damage"], cat["armor"], cat["health"]) == (10, 0, -2)
    assert [f["name"] for f in families if f["new"]] == ["Fox"]


def test_committed_abilities_pin_known_ranks() -> None:
    abilities = {a["slug"]: a for a in _forever()["abilities"]}
    assert [r[1] for r in abilities["prowl"]["ranks"]] == [30, 40, 50]
    assert [r[1] for r in abilities["furious-howl"]["ranks"]] == [10, 24, 40, 56]
    assert [r[1] for r in abilities["bite"]["ranks"]] == [1, 8, 16, 24, 32, 40, 48, 56]
    assert abilities["swipe"]["new"] is True
    # Thunderstomp's rank 4 is Forever's; the first three are Classic's.
    assert [r[3] for r in abilities["thunderstomp"]["ranks"]] == [0, 0, 0, 1]
    assert "faster-attack-i" not in abilities and "summoning" not in abilities


def test_every_ability_family_exists_and_every_rank_has_a_level() -> None:
    doc = _forever()
    ids = {f["id"] for f in doc["families"]}
    for ability in doc["abilities"]:
        assert ability["families"] and set(ability["families"]) <= ids
        assert ability["ranks"] and all(r[1] > 0 for r in ability["ranks"])


def test_committed_beasts_are_taught_only_known_ranks_and_sit_in_known_zones() -> None:
    forever, classic = _forever(), _classic()
    rank_spells = {r[0] for a in forever["abilities"] for r in a["ranks"]}
    family_ids = {f["id"] for f in forever["families"]}
    assert len(classic["beasts"]) > 400
    for _id, _name, family, low, high, speed, zones, teaches in classic["beasts"]:
        assert family in family_ids and 0 < low <= high and speed > 0
        assert zones and set(zones) <= set(classic["zones"])
        assert set(teaches) <= rank_spells


def test_seen_beasts_include_forever_only_ones() -> None:
    forever, classic = _forever(), _classic()
    classic_ids = {b[0] for b in classic["beasts"]}
    seen = {s[0]: s for s in forever["seen"]}
    assert 165189 not in seen
    assert any(s[1] == "Gray Fox" and s[2] == 319 for s in seen.values())
    assert any(i not in classic_ids for i in seen) and any(i in classic_ids for i in seen)
