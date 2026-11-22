"""MGA Loot's item-effect values (``scripts/wow_loot``): each conversion, and the committed data."""
from __future__ import annotations

import json
from functools import cache
from typing import Any

import pytest

from scripts.wow_loot.class_spell import ClassSpell, changed_spells, class_spells
from scripts.wow_loot.effect_model import (
    AURA_ATTACK_POWER,
    AURA_DUMMY,
    AURA_PROC_TRIGGER,
    AURA_RESISTANCE,
    CASTER_TARGET,
    EFFECT_APPLY_AURA,
    EFFECT_EXTRA_ATTACKS,
    EFFECT_HEAL,
    EFFECT_SCHOOL_DAMAGE,
    NONE,
    TRIGGER_CHANCE_ON_HIT,
    TRIGGER_ON_EQUIP,
    TRIGGER_ON_USE,
    UNRESOLVED,
    EffectRow,
    Entry,
    Item,
    Creature,
    ItemSpell,
    Spell,
    World,
)
from scripts.wow_loot.effect_values import item_entries, proc_rate
from scripts.wow_loot.item_effects import OUT, classic_item_ppm
from scripts.wow_loot.mobs import creature_dps, mob_world, normal_mobs, summoned_creature, unique_names

ENEMY = 6
FIRE = 4
WATER_BREATHING = 82
WEAPON = Item(1, weapon_speed=2.0)
ARMOUR = Item(2)


def _damage(base: float) -> EffectRow:
    return EffectRow(EFFECT_SCHOOL_DAMAGE, 0, base, 0, 0, 0, ENEMY)


def _aura(aura: int, base: float, misc: int = 0, trigger: int = 0) -> EffectRow:
    return EffectRow(EFFECT_APPLY_AURA, aura, base, misc, 0, trigger, CASTER_TARGET)


def _entries(item: Item, effect: ItemSpell, *spells: Spell, world: World = World()) -> list[Entry]:
    return item_entries(item, [effect], {s.id: s for s in spells}, world)


EFFECT_SUMMON = 28
AURA_STUN = 12
WORLD = World(mob_dps=((30, 29.9), (40, 46.1)), mob_armor=((40, 2539.0),), resist_free=frozenset({"Fire", "Shadow"}))


def _enemy_aura(aura: int, base: float, misc: int = 0) -> EffectRow:
    return EffectRow(EFFECT_APPLY_AURA, aura, base, misc, 0, 0, ENEMY)


def _summon(creature_id: int) -> EffectRow:
    return EffectRow(EFFECT_SUMMON, 0, 0, creature_id, 0, 0, CASTER_TARGET)


# --- On use ----------------------------------------------------------------------------------


def test_use_stat_buff_is_stat_times_duration_over_cooldown() -> None:
    buff = Spell(10, "Earthstrike", duration_ms=20_000, cooldown_ms=120_000, effects=(_aura(AURA_ATTACK_POWER, 280),))
    [entry] = _entries(ARMOUR, ItemSpell(10, TRIGGER_ON_USE), buff)
    assert entry.stat == "attack_power"
    assert entry.value == pytest.approx(280 * 20 / 120, abs=1e-3)
    assert entry.note == "use: +280 attack power for 20s every 2min → +46.7 attack power"


def test_use_buff_longer_than_its_cooldown_counts_in_full() -> None:
    buff = Spell(10, "Long", duration_ms=60_000, cooldown_ms=30_000, effects=(_aura(AURA_ATTACK_POWER, 50),))
    [entry] = _entries(ARMOUR, ItemSpell(10, TRIGGER_ON_USE), buff)
    assert entry.value == 50


def test_use_damage_is_amount_over_cooldown() -> None:
    nuke = Spell(11, "Fire Blast", school_mask=FIRE, cooldown_ms=300_000, effects=(_damage(375),))
    [entry] = _entries(ARMOUR, ItemSpell(11, TRIGGER_ON_USE), nuke)
    assert (entry.stat, entry.value) == ("use_dps", 1.25)
    assert entry.note == "use: 375 Fire dmg every 5min → +1.2 DPS"


def test_use_heal_is_amount_over_cooldown_as_healing() -> None:
    heal = Spell(12, "Heal", effects=(EffectRow(EFFECT_HEAL, 0, 600, 0, 0, 0, CASTER_TARGET),))
    [entry] = _entries(ARMOUR, ItemSpell(12, TRIGGER_ON_USE, cooldown_ms=60_000), heal)
    assert (entry.stat, entry.value) == ("healing", 10)


def test_use_with_no_cooldown_is_unresolved() -> None:
    buff = Spell(13, "Free", duration_ms=10_000, effects=(_aura(AURA_ATTACK_POWER, 50),))
    [entry] = _entries(ARMOUR, ItemSpell(13, TRIGGER_ON_USE), buff)
    assert entry.stat == UNRESOLVED


# --- Chance on hit ---------------------------------------------------------------------------


def test_proc_damage_at_ppm_is_damage_times_ppm_over_60() -> None:
    proc = Spell(20, "Fireball", school_mask=FIRE, ppm=1, effects=(_damage(100),))
    [entry] = _entries(WEAPON, ItemSpell(20, TRIGGER_CHANCE_ON_HIT), proc)
    assert entry.stat == "dps"
    assert entry.value == pytest.approx(100 / 60, abs=1e-3)
    assert entry.note == "proc: 100 Fire dmg at 1 PPM → +1.7 DPS"


def test_proc_chance_on_a_weapon_uses_its_speed() -> None:
    proc = Spell(21, "Zap", proc_chance=10, effects=(_damage(50),))
    [entry] = _entries(WEAPON, ItemSpell(21, TRIGGER_CHANCE_ON_HIT), proc)
    assert entry.value == pytest.approx(50 * 0.10 / 2.0, abs=1e-3)


def test_proc_chance_on_armour_assumes_a_swing_rate() -> None:
    rate = proc_rate(ARMOUR, 5, 0, 0)
    assert rate is not None
    assert rate.per_second == pytest.approx(0.05 / 2.5)
    assert "assuming a hit every 2.5s" in rate.text


def test_proc_rate_is_capped_by_its_internal_cooldown() -> None:
    rate = proc_rate(WEAPON, 100, 0, 20_000)
    assert rate is not None
    assert rate.per_second == pytest.approx(1 / 20)
    assert rate.text.endswith("capped by its 20s cooldown")


def test_proc_chance_101_is_no_rate_and_classic_fills_the_gap() -> None:
    assert proc_rate(WEAPON, 101, 0, 0) is None
    rate = proc_rate(WEAPON, 101, 0, 0, classic_ppm=1)
    assert rate is not None
    assert rate.text == "1 PPM (Classic rate)"


def test_item_proc_with_no_rate_takes_the_classic_server_rule() -> None:
    # Fiery War Axe: ProcChance 101 and spellppmRate 0, so the server procs it at speed x 1.8 % per swing = 1.08 PPM.
    proc = Spell(22, "Fireball", proc_chance=101, effects=(_damage(150),))
    [entry] = _entries(WEAPON, ItemSpell(22, TRIGGER_CHANCE_ON_HIT), proc)
    assert entry.stat == "dps"
    assert entry.value == pytest.approx(150 * 1.08 / 60, abs=1e-3)
    assert "1.08 PPM (Classic server rule)" in entry.note


def test_proc_chance_0_never_procs_so_stays_unresolved() -> None:
    proc = Spell(22, "Fireball", proc_chance=0, effects=(_damage(150),))
    [entry] = _entries(WEAPON, ItemSpell(22, TRIGGER_CHANCE_ON_HIT), proc)
    assert entry == Entry(UNRESOLVED, 0, "Fireball: the data gives no proc rate")


def test_proc_buff_is_stat_times_uptime() -> None:
    buff = Spell(23, "Crusader", ppm=1, duration_ms=15_000, effects=(_aura(29, 100, misc=0),))
    [entry] = _entries(WEAPON, ItemSpell(23, TRIGGER_CHANCE_ON_HIT), buff)
    assert entry.stat == "strength"
    assert entry.value == pytest.approx(100 * min(1, 1 / 60 * 15), abs=1e-3)


def test_proc_extra_attack_is_a_share_of_weapon_dps() -> None:
    # Hand of Justice: an equip aura that procs one extra attack at 2% per hit; armour assumes a hit every 2.5s.
    extra = Spell(24, "Extra Attack", effects=(EffectRow(EFFECT_EXTRA_ATTACKS, 0, 1, 0, 0, 0, CASTER_TARGET),))
    hand = Spell(25, "Hand", proc_chance=2, effects=(_aura(AURA_PROC_TRIGGER, 0, trigger=24),))
    [entry] = _entries(ARMOUR, ItemSpell(25, TRIGGER_ON_EQUIP), hand, extra)
    assert entry.stat == "dps_pct"
    assert entry.value == pytest.approx(0.02, abs=1e-3)


def test_classic_rate_for_a_renumbered_proc_spell() -> None:
    classic = {1728: [(18086, 1.0)]}
    assert classic_item_ppm(1728, 1300753, 1, classic) == 1.0
    assert classic_item_ppm(1728, 1300753, 2, classic) == 0.0


# --- Summons --------------------------------------------------------------------------------


def test_creature_dps_follows_cmangos_damage_formula() -> None:
    # Tracking Hound: 66-73 damage, 2.0s swing, 32 attack power, multiplier 1.
    hound = {
        "MinMeleeDmg": "66", "MaxMeleeDmg": "73", "MeleeBaseAttackTime": "2000", "MeleeAttackPower": "32",
        "DamageMultiplier": "1",
    }
    assert creature_dps(hound) == pytest.approx((69.5 + 32 / 14 * 2) / 2, abs=0.05)


def test_use_summon_is_creature_dps_times_uptime() -> None:
    hound = Creature(6867, "Tracking Hound", 37.0)
    spell = Spell(40, "Summon Tracking Hound", duration_ms=180_000, creatures=(hound,), effects=(_summon(6867),))
    [entry] = _entries(ARMOUR, ItemSpell(40, TRIGGER_ON_USE, cooldown_ms=600_000), spell)
    assert entry.stat == "use_dps"
    assert entry.value == pytest.approx(37 * 0.3, abs=1e-3)
    assert entry.note == "use: summons Tracking Hound (37 DPS) for 3min every 10min → +11.1 DPS"


def test_cast_proc_summon_the_classic_data_lacks_counts_at_the_median_mob() -> None:
    # Zum'rah's Vexing Cane: on a harmful spell cast, 100% capped at once a minute, a Forever-only zombie for 20s.
    troll = Creature(265223, "Zombie Troll of Zum'rah", None)
    summon = Spell(41, "Summon Zombie", duration_ms=20_000, creatures=(troll,), effects=(_summon(265223),))
    aura = Spell(
        42, "Vexing", proc_chance=100, proc_icd_ms=60_000, cast_proc=True, chance_worded=True,
        effects=(_aura(AURA_PROC_TRIGGER, 0, trigger=41),),
    )
    cane = Item(18082, weapon_speed=3.0, level=42)
    [entry] = _entries(cane, ItemSpell(42, TRIGGER_ON_EQUIP), aura, summon, world=WORLD)
    assert entry.stat == "spell_dps"
    assert entry.value == pytest.approx(46.1 * 20 / 60, abs=1e-3)
    assert "once every 1min (its cooldown; the chance per cast isn't in the data" in entry.note
    assert "counts as a normal level 40-49 mob (46.1 DPS, the median)" in entry.note


def _fire_proc(spell_id: int, *, icd_ms: int, chance_worded: bool) -> tuple[Spell, Spell]:
    bolt = Spell(spell_id + 1, "Firebolt", school_mask=FIRE, effects=(_damage(100),))
    aura = Spell(
        spell_id, "Firebolt", proc_chance=100, proc_icd_ms=icd_ms, cast_proc=True, chance_worded=chance_worded,
        effects=(_aura(AURA_PROC_TRIGGER, 0, trigger=spell_id + 1),),
    )
    return aura, bolt


def test_chance_worded_proc_at_100_has_no_rate_without_a_long_cooldown() -> None:
    # "Chance on harmful spell cast to blast a target": the client's 100 isn't the chance; a 100ms cooldown says nothing.
    aura, bolt = _fire_proc(60, icd_ms=100, chance_worded=True)
    [entry] = _entries(ARMOUR, ItemSpell(60, TRIGGER_ON_EQUIP), aura, bolt)
    assert entry == Entry(UNRESOLVED, 0, "Firebolt: the data gives no proc rate")


def test_proc_at_100_its_tooltip_doesnt_call_a_chance_is_every_cast() -> None:
    # "Harmful spell casts sear the target": 100% is the rate.
    aura, bolt = _fire_proc(62, icd_ms=0, chance_worded=False)
    [entry] = _entries(ARMOUR, ItemSpell(62, TRIGGER_ON_EQUIP), aura, bolt)
    assert (entry.stat, entry.value) == ("spell_dps", pytest.approx(100 / 2.5, abs=1e-3))


def test_cast_proc_chance_counts_casts_not_swings() -> None:
    rate = proc_rate(WEAPON, 10, 0, 0, cast=True)
    assert rate is not None
    assert rate.per_second == pytest.approx(0.10 / 2.5)
    assert rate.text == "10% per cast, assuming a cast every 2.5s"


def test_summon_that_does_not_fight_has_no_combat_value() -> None:
    critter = Creature(7, "Rabbit", 1.0, fights=False)
    spell = Spell(43, "Summon Rabbit", duration_ms=60_000, creatures=(critter,), effects=(_summon(7),))
    [entry] = _entries(ARMOUR, ItemSpell(43, TRIGGER_ON_USE, cooldown_ms=60_000), spell)
    assert entry.stat == NONE


def test_summon_of_a_creature_the_data_lacks_is_unresolved() -> None:
    spell = Spell(44, "Summon", duration_ms=60_000, effects=(_summon(5),))
    [entry] = _entries(ARMOUR, ItemSpell(44, TRIGGER_ON_USE, cooldown_ms=60_000), spell)
    assert entry.stat == UNRESOLVED


def test_summoned_creature_by_id_then_by_client_name() -> None:
    templates = {1: {"Entry": "1", "Name": "Wolf", "CreatureType": "1", "MinMeleeDmg": "10", "MaxMeleeDmg": "10"}}
    names = unique_names(templates.values())
    assert summoned_creature(1, templates, names, {}).name == "Wolf"
    assert summoned_creature(99, templates, names, {99: ("Wolf", 1)}).dps == creature_dps(templates[1])
    unknown = summoned_creature(98, templates, names, {98: ("Zombie", 6)})
    assert (unknown.name, unknown.dps, unknown.fights) == ("Zombie", None, True)


def _mob(entry: int, level: int, armor: int, **extra: str) -> dict[str, str]:
    return {
        "Entry": str(entry), "MinLevel": str(level), "Armor": str(armor), "CreatureType": "7", "Rank": "0",
        "NpcFlags": "0", "MinMeleeDmg": "10", "MaxMeleeDmg": "10", **extra,
    }


def test_mob_world_takes_medians_of_spawned_normal_mobs_by_band() -> None:
    templates = {
        1: _mob(1, 41, 2000), 2: _mob(2, 44, 3000), 3: _mob(3, 45, 2500),
        4: _mob(4, 45, 9000, Rank="1"),  # elite
        5: _mob(5, 45, 9000, NpcFlags="2"),  # a quest giver
        6: _mob(6, 45, 9000),  # never spawned
        7: _mob(7, 12, 600, ResistanceFire="20"),
    }
    world = mob_world(normal_mobs([{"id": str(i)} for i in (1, 2, 3, 4, 5, 7)], templates))
    assert world.mob_armor == ((10, 600.0), (40, 2500.0))
    assert "Fire" not in world.resist_free
    assert "Shadow" in world.resist_free


# --- On the enemy ----------------------------------------------------------------------------


def test_armor_cut_is_average_armor_off_the_target() -> None:
    sunder = Spell(50, "Sunder", ppm=1, duration_ms=30_000, effects=(_enemy_aura(AURA_RESISTANCE, -200, misc=1),))
    [entry] = _entries(WEAPON, ItemSpell(50, TRIGGER_CHANCE_ON_HIT), sunder, world=WORLD)
    assert entry.stat == "armor_cut"
    assert entry.value == pytest.approx(200 * 0.5, abs=1e-3)
    assert entry.note == "proc: -200 armor on the target for 30s at 1 PPM → -100 armor on average"


def test_resistance_cut_no_mob_has_is_worth_nothing() -> None:
    curse = Spell(51, "Curse", ppm=1, duration_ms=10_000, effects=(_enemy_aura(AURA_RESISTANCE, -50, misc=FIRE),))
    [entry] = _entries(WEAPON, ItemSpell(51, TRIGGER_CHANCE_ON_HIT), curse, world=WORLD)
    assert entry.stat == NONE
    assert "normal mobs at every level resist none" in entry.note


def test_control_on_the_enemy_has_no_damage_value() -> None:
    stun = Spell(52, "Hammer", ppm=2, duration_ms=3_000, effects=(_enemy_aura(AURA_STUN, 0),))
    [entry] = _entries(WEAPON, ItemSpell(52, TRIGGER_CHANCE_ON_HIT), stun)
    assert entry == Entry(NONE, 0, "Hammer: control effect: no damage or healing value", pvp=True)


# --- PvP marks: a label on effects worth a lot more against players, never a number ------------

AURA_MECHANIC_IMMUNITY = 77
AURA_RESIST_CC = 117


def test_armor_and_resistance_cuts_are_marked_pvp() -> None:
    sunder = Spell(53, "Sunder", ppm=1, duration_ms=30_000, effects=(_enemy_aura(AURA_RESISTANCE, -200, misc=1),))
    curse = Spell(54, "Curse", ppm=1, duration_ms=10_000, effects=(_enemy_aura(AURA_RESISTANCE, -50, misc=FIRE),))
    assert _entries(WEAPON, ItemSpell(53, TRIGGER_CHANCE_ON_HIT), sunder, world=WORLD)[0].pvp
    assert _entries(WEAPON, ItemSpell(54, TRIGGER_CHANCE_ON_HIT), curse, world=WORLD)[0].pvp


def test_immunities_and_crowd_control_resists_are_marked_pvp() -> None:
    immune = Spell(55, "Immune Root/Snare/Stun", effects=(_aura(AURA_MECHANIC_IMMUNITY, 0),))
    resist = Spell(56, "Resist Fear", effects=(_aura(AURA_RESIST_CC, 15),))
    [entry] = _entries(ARMOUR, ItemSpell(55, TRIGGER_ON_EQUIP), immune)
    assert entry == Entry(UNRESOLVED, 0, "Immune Root/Snare/Stun: an immunity, which has no stat weight", pvp=True)
    assert _entries(ARMOUR, ItemSpell(56, TRIGGER_ON_EQUIP), resist)[0].pvp


def test_a_proc_when_you_are_hit_is_marked_pvp_and_one_on_your_hits_is_not() -> None:
    bolt = Spell(58, "Firebolt", school_mask=FIRE, effects=(_damage(100),))
    struck = Spell(57, "Firebolt", proc_chance=10, when_hit=True, effects=(_aura(AURA_PROC_TRIGGER, 0, trigger=58),))
    hitting = Spell(59, "Firebolt", proc_chance=10, effects=(_aura(AURA_PROC_TRIGGER, 0, trigger=58),))
    [hit] = _entries(ARMOUR, ItemSpell(57, TRIGGER_ON_EQUIP), struck, bolt)
    assert hit.stat == "dps" and hit.pvp
    [swing] = _entries(WEAPON, ItemSpell(59, TRIGGER_ON_EQUIP), hitting, bolt)
    assert swing.stat == "dps" and not swing.pvp


def test_plain_damage_and_stat_effects_are_not_marked_pvp() -> None:
    buff = Spell(60, "Earthstrike", duration_ms=20_000, cooldown_ms=120_000, effects=(_aura(AURA_ATTACK_POWER, 280),))
    assert not _entries(ARMOUR, ItemSpell(60, TRIGGER_ON_USE), buff)[0].pvp


# --- Equip -----------------------------------------------------------------------------------


def test_equip_aura_maps_to_its_weight_key() -> None:
    aura = Spell(30, "Attack Power", effects=(_aura(AURA_ATTACK_POWER, 40),))
    assert _entries(ARMOUR, ItemSpell(30, TRIGGER_ON_EQUIP), aura) == [Entry("attack_power", 40, "equip: +40 attack power")]


def test_equip_aura_the_item_stats_already_give_is_skipped() -> None:
    aura = Spell(31, "Attack Power", effects=(_aura(AURA_ATTACK_POWER, 40),))
    assert _entries(Item(3, stat_keys=frozenset({"attack_power"})), ItemSpell(31, TRIGGER_ON_EQUIP), aura) == []


def test_no_combat_value_is_zero_with_a_note() -> None:
    breathing = Spell(32, "Water Breathing", effects=(_aura(WATER_BREATHING, 0),))
    assert _entries(ARMOUR, ItemSpell(32, TRIGGER_ON_EQUIP), breathing) == [Entry(NONE, 0, "Water Breathing: no combat value")]


def test_scripted_dummy_is_unresolved() -> None:
    dummy = Spell(33, "Wolfshead", effects=(_aura(AURA_DUMMY, 0),))
    [entry] = _entries(ARMOUR, ItemSpell(33, TRIGGER_ON_EQUIP), dummy)
    assert entry.stat == UNRESOLVED


def test_missing_spell_is_unresolved() -> None:
    assert _entries(ARMOUR, ItemSpell(99, TRIGGER_ON_EQUIP))[0].stat == UNRESOLVED


# --- The committed data ----------------------------------------------------------------------


@cache
def _committed() -> dict[str, Any]:
    return json.loads(OUT.read_text(encoding="utf-8"))


def _item(item_id: int) -> list[dict[str, Any]]:
    return _committed()["items"][str(item_id)]


def test_committed_fire_proc_weapon() -> None:
    # Teebu's Blazing Longsword: Forever renumbered its proc; the Classic rate is 1 PPM.
    assert _item(1728) == [{"stat": "dps", "value": 2.333, "note": "proc: 140 Fire dmg at 1 PPM (Classic rate) → +2.3 DPS"}]


def test_committed_on_use_trinket() -> None:
    assert _item(21180) == [
        {"stat": "attack_power", "value": 46.667, "note": "use: +280 attack power for 20s every 2min → +46.7 attack power"},
    ]


def test_committed_zumrahs_cane_counts_its_summon() -> None:
    [entry] = _item(18082)
    assert entry["stat"] == "spell_dps"
    assert entry["value"] > 0
    assert "summons Zombie Troll of Zum'rah" in entry["note"]


def test_committed_mob_armor_rises_with_level() -> None:
    armor = [a for _, a in sorted((int(band), a) for band, a in _committed()["mobArmor"].items())]
    assert len(armor) == 6
    assert armor == sorted(armor)


def test_committed_pvp_marks() -> None:
    # Insignia of the Alliance: the immunity it gives is worth more against players.
    assert _item(18854)[0]["pvp"] is True
    # Dark Iron Pulverizer's stun, Naglering's damage shield, Rivenspike's armor cut.
    assert _item(11608)[0]["pvp"] is True
    assert _item(11669)[0]["pvp"] is True
    assert _item(13286)[0]["pvp"] is True
    # Teebu's fire proc and Earthstrike's attack power are plain PvE values.
    assert "pvp" not in _item(1728)[0]
    assert "pvp" not in _item(21180)[0]


def test_committed_class_spell_modifiers_count_for_their_class() -> None:
    # Totem of Rage's flat shock damage: a shaman's, valued at Earth Shock every 6s.
    shock = _item(22395)[0]
    assert shock["class"] == "shaman"
    assert shock["stat"] == "spell_dps"
    assert shock["value"] > 0
    assert "Earth Shock" in shock["note"]
    # The rogue's Kick cooldown cut counts for rogues.
    assert _item(19617)[0]["class"] == "rogue"


def test_committed_water_breathing_item() -> None:
    assert _item(9452) == [{"stat": "none", "value": 0, "note": "Water Breathing: no combat value"}]


def test_committed_entries_are_well_formed() -> None:
    items = _committed()["items"]
    assert len(items) > 1000
    for item_id, entries in items.items():
        assert entries, item_id
        for entry in entries:
            assert set(entry) <= {"stat", "value", "note", "pvp", "class"}, item_id
            assert entry.get("pvp", True) is True, item_id
            assert entry["note"], item_id
            if entry["stat"] in (NONE, UNRESOLVED):
                assert entry["value"] == 0, item_id


# --- Class-spell modifiers ------------------------------------------------------------------

AURA_ADD_FLAT_MODIFIER = 107
AURA_ADD_PCT_MODIFIER = 108
SHAMAN_FAMILY = 11
PRIEST_FAMILY = 6
SHOCK_MASK = (0x100000, 0, 0, 0)
NATURE = 8
EARTH_SHOCK = ClassSpell(8046, "Earth Shock", SHAMAN_FAMILY, SHOCK_MASK, "shaman", school_mask=NATURE,
                         cooldown_ms=6000, mana_cost=345, direct=517)
LIGHTNING_BOLT = ClassSpell(15208, "Lightning Bolt", SHAMAN_FAMILY, (0x1, 0, 0, 0), "shaman", school_mask=NATURE,
                            cast_ms=3000, mana_cost=265, direct=419)
SHAMAN_WORLD = World(class_spells=(EARTH_SHOCK, LIGHTNING_BOLT))


def _modifier(aura: int, op: int, amount: float, mask: tuple[int, int, int, int]) -> EffectRow:
    return EffectRow(EFFECT_APPLY_AURA, aura, amount, op, 0, 0, CASTER_TARGET, class_mask=mask)


def _equip_mod(row: EffectRow, family: int = SHAMAN_FAMILY) -> list[Entry]:
    spell = Spell(60, "Shock Totem", effects=(row,), family=family)
    return _entries(ARMOUR, ItemSpell(60, TRIGGER_ON_EQUIP), spell, world=SHAMAN_WORLD)


def test_flat_spell_damage_is_extra_per_cast_over_its_cooldown_for_its_class() -> None:
    [entry] = _equip_mod(_modifier(AURA_ADD_FLAT_MODIFIER, 0, 30, SHOCK_MASK))
    assert entry.stat == "spell_dps"
    assert entry.value == 5.0
    assert entry.cls == "shaman"
    assert "Earth Shock" in entry.note


def test_percent_spell_damage_is_a_share_of_the_base_amount() -> None:
    [entry] = _equip_mod(_modifier(AURA_ADD_PCT_MODIFIER, 0, 10, SHOCK_MASK))
    assert entry.value == pytest.approx(51.7 / 6, abs=0.001)


def test_mana_cost_cut_is_mp5() -> None:
    [entry] = _equip_mod(_modifier(AURA_ADD_FLAT_MODIFIER, 14, -60, SHOCK_MASK))
    assert entry.stat == "mp5"
    assert entry.value == 50.0
    assert entry.cls == "shaman"


def test_cooldown_cut_is_more_casts() -> None:
    [entry] = _equip_mod(_modifier(AURA_ADD_FLAT_MODIFIER, 11, -1000, SHOCK_MASK))
    assert entry.value == pytest.approx(517 * (1 / 5 - 1 / 6), abs=0.001)


def test_spell_with_no_cooldown_is_not_computable_for_its_class() -> None:
    [entry] = _equip_mod(_modifier(AURA_ADD_FLAT_MODIFIER, 0, 30, (0x1, 0, 0, 0)))
    assert entry.stat == UNRESOLVED
    assert entry.cls == "shaman"
    assert "no cooldown" in entry.note


def test_crit_chance_change_is_not_computable_for_its_class() -> None:
    [entry] = _equip_mod(_modifier(AURA_ADD_FLAT_MODIFIER, 7, 5, SHOCK_MASK))
    assert entry.stat == UNRESOLVED
    assert entry.cls == "shaman"
    assert "critical strike chance of Earth Shock" in entry.note


def test_change_to_spells_the_data_does_not_list_is_not_computable() -> None:
    [entry] = _equip_mod(_modifier(AURA_ADD_FLAT_MODIFIER, 0, 30, SHOCK_MASK), family=PRIEST_FAMILY)
    assert entry.stat == UNRESOLVED
    assert entry.cls == "priest"


def test_change_to_several_spells_counts_at_the_one_it_adds_most_to() -> None:
    frost = ClassSpell(10473, "Frost Shock", SHAMAN_FAMILY, SHOCK_MASK, "shaman", school_mask=16,
                       cooldown_ms=6000, mana_cost=325, direct=486)
    spells = (EARTH_SHOCK, frost)
    spell = Spell(61, "Shock Totem", effects=(_modifier(AURA_ADD_PCT_MODIFIER, 0, 10, SHOCK_MASK),), family=SHAMAN_FAMILY)
    [entry] = _entries(ARMOUR, ItemSpell(61, TRIGGER_ON_EQUIP), spell, world=World(class_spells=spells))
    assert "Earth Shock" in entry.note
    assert "the most of the 2 spells" in entry.note


def test_changed_spells_match_family_and_any_mask_word() -> None:
    other_family = ClassSpell(1, "Earth Shock", PRIEST_FAMILY, SHOCK_MASK, "priest")
    assert changed_spells((EARTH_SHOCK, LIGHTNING_BOLT, other_family), SHAMAN_FAMILY, SHOCK_MASK) == [EARTH_SHOCK]


def _option(spell_id: int, family: int, mask0: int) -> dict[str, str]:
    return {"SpellID": str(spell_id), "SpellClassSet": str(family), "SpellClassMask_0": str(mask0),
            "SpellClassMask_1": "0", "SpellClassMask_2": "0", "SpellClassMask_3": "0"}


def test_class_spells_keep_the_owning_class_top_rank_by_level_60() -> None:
    shaman_bit, priest_bit = 64, 16
    options = [_option(1, SHAMAN_FAMILY, 0x100000), _option(2, SHAMAN_FAMILY, 0x100000),
               _option(3, SHAMAN_FAMILY, 0x100000), _option(4, SHAMAN_FAMILY, 0x2)]
    abilities = [{"Spell": "1", "ClassMask": str(shaman_bit)}, {"Spell": "2", "ClassMask": str(shaman_bit)},
                 {"Spell": "3", "ClassMask": str(shaman_bit)}, {"Spell": "4", "ClassMask": str(priest_bit)}]
    names = {1: "Earth Shock", 2: "Earth Shock", 3: "Earth Shock", 4: "Not a shaman spell"}
    damage = {"Effect": "2", "EffectAura": "0", "EffectBasePointsF": "100", "EffectAuraPeriod": "0"}
    effects = {i: [damage] for i in names}
    levels = [{"SpellID": "1", "BaseLevel": "4"}, {"SpellID": "2", "BaseLevel": "52"},
              {"SpellID": "3", "BaseLevel": "62"}]
    [spell] = class_spells(options, abilities, names, effects, [], [], {}, [], levels, [])
    assert (spell.id, spell.cls, spell.direct) == (2, "shaman", 100)
