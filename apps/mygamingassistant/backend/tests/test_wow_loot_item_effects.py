"""MGA Loot's item-effect values (``scripts/wow_loot``): each conversion, and the committed data."""
from __future__ import annotations

import json
from functools import cache
from typing import Any

import pytest

from scripts.wow_loot.effect_values import (
    AURA_ATTACK_POWER,
    AURA_DUMMY,
    AURA_PROC_TRIGGER,
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
    ItemSpell,
    Spell,
    item_entries,
    proc_rate,
)
from scripts.wow_loot.item_effects import OUT, classic_item_ppm

ENEMY = 6
FIRE = 4
WATER_BREATHING = 82
WEAPON = Item(1, weapon_speed=2.0)
ARMOUR = Item(2)


def _damage(base: float) -> EffectRow:
    return EffectRow(EFFECT_SCHOOL_DAMAGE, 0, base, 0, 0, 0, ENEMY)


def _aura(aura: int, base: float, misc: int = 0, trigger: int = 0) -> EffectRow:
    return EffectRow(EFFECT_APPLY_AURA, aura, base, misc, 0, trigger, CASTER_TARGET)


def _entries(item: Item, effect: ItemSpell, *spells: Spell) -> list[Entry]:
    return item_entries(item, [effect], {s.id: s for s in spells})


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
    assert (entry.stat, entry.value) == ("dps", 1.25)
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


def test_proc_with_no_rate_is_unresolved_never_guessed() -> None:
    proc = Spell(22, "Fireball", proc_chance=101, effects=(_damage(150),))
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


def test_committed_water_breathing_item() -> None:
    assert _item(9452) == [{"stat": "none", "value": 0, "note": "Water Breathing: no combat value"}]


def test_committed_entries_are_well_formed() -> None:
    items = _committed()["items"]
    assert len(items) > 1000
    for item_id, entries in items.items():
        assert entries, item_id
        for entry in entries:
            assert set(entry) == {"stat", "value", "note"}, item_id
            assert entry["note"], item_id
            if entry["stat"] in (NONE, UNRESOLVED):
                assert entry["value"] == 0, item_id
