"""Blizzard's ``/statistics`` answer → ``CharacterStats`` (the character pane's numbers).

Totals are Blizzard's own (gear, talents and buffs at log out) — never
recomputed. Weapon damage is kept only for a hand that holds a weapon: Blizzard
reports an unarmed "off hand" even behind a two-hander.
"""
from __future__ import annotations

from typing import Any

from app.schemas.wow.character.character_defense_stats import CharacterDefenseStats
from app.schemas.wow.character.character_melee_stats import CharacterMeleeStats
from app.schemas.wow.character.character_ranged_stats import CharacterRangedStats
from app.schemas.wow.character.character_resistances import CharacterResistances
from app.schemas.wow.character.character_spell_stats import CharacterSpellStats
from app.schemas.wow.character.character_stat_value import CharacterStatValue
from app.schemas.wow.character.character_stats import CharacterStats
from app.schemas.wow.character.character_weapon_damage import CharacterWeaponDamage
from app.services.wow.character.character_json import as_dict, as_float, as_int, as_list, as_str, name_of

_NORMAL_MOVEMENT_SPEED = 100.0


def _whole(stats: dict[str, Any], key: str) -> int:
    return as_int(stats.get(key)) or 0


def _number(stats: dict[str, Any], key: str) -> float:
    return as_float(stats.get(key)) or 0.0


def _percent(stats: dict[str, Any], key: str) -> float:
    """A chance stat (``{"value": 4.93, "rating_bonus": 0, …}``) as its percent."""
    return as_float(as_dict(stats.get(key)).get("value")) or 0.0


def _value(stats: dict[str, Any], key: str) -> CharacterStatValue:
    raw = as_dict(stats.get(key))
    effective = as_int(raw.get("effective")) or 0
    return CharacterStatValue(base=as_int(raw.get("base")) or effective, effective=effective)


def _weapon_slots(equipment: dict[str, Any] | None) -> set[str]:
    """The slots holding something with weapon damage (main hand, off hand, ranged)."""
    slots: set[str] = set()
    for item in as_list(as_dict(equipment).get("equipped_items")):
        raw = as_dict(item)
        if as_dict(raw.get("weapon")):
            slot = as_str(as_dict(raw.get("slot")).get("type"))
            if slot is not None:
                slots.add(slot)
    return slots


def _hand(stats: dict[str, Any], prefix: str) -> CharacterWeaponDamage | None:
    low = as_float(stats.get(f"{prefix}_damage_min"))
    high = as_float(stats.get(f"{prefix}_damage_max"))
    if low is None or high is None:
        return None
    return CharacterWeaponDamage(
        min=low, max=high, speed=as_float(stats.get(f"{prefix}_speed")), dps=as_float(stats.get(f"{prefix}_dps")),
    )


def _ranged_damage(stats: dict[str, Any]) -> CharacterWeaponDamage | None:
    low = as_float(stats.get("ranged_damage_min"))
    high = as_float(stats.get("ranged_damage_max"))
    if low is None or high is None:
        return None
    return CharacterWeaponDamage(min=low, max=high, speed=None, dps=None)


def _only_if(slot: str, slots: set[str], damage: CharacterWeaponDamage | None) -> CharacterWeaponDamage | None:
    return damage if slot in slots else None


def to_character_stats(statistics: dict[str, Any] | None, equipment: dict[str, Any] | None) -> CharacterStats | None:
    """None when Blizzard has no statistics for the character yet."""
    if not statistics:
        return None
    s = statistics
    slots = _weapon_slots(equipment)
    return CharacterStats(
        health=_whole(s, "health"),
        power=_whole(s, "power"),
        power_type=name_of(s.get("power_type")) or "Mana",
        strength=_value(s, "strength"),
        agility=_value(s, "agility"),
        stamina=_value(s, "stamina"),
        intellect=_value(s, "intellect"),
        spirit=_value(s, "spirit"),
        melee=CharacterMeleeStats(
            attack_power=_whole(s, "attack_power"),
            main_hand=_only_if("MAIN_HAND", slots, _hand(s, "main_hand")),
            off_hand=_only_if("OFF_HAND", slots, _hand(s, "off_hand")),
            crit=_percent(s, "melee_crit"),
            hit=_percent(s, "melee_hit"),
            haste=_percent(s, "melee_haste"),
            expertise=_number(s, "expertise"),
        ),
        ranged=CharacterRangedStats(
            attack_power=_whole(s, "ranged_attack_power"),
            damage=_only_if("RANGED", slots, _ranged_damage(s)),
            crit=_percent(s, "ranged_crit"),
            hit=_percent(s, "ranged_hit"),
            haste=_percent(s, "ranged_haste"),
        ),
        spell=CharacterSpellStats(
            power=_whole(s, "spell_power"),
            healing=_whole(s, "spell_healing"),
            crit=_percent(s, "spell_crit"),
            hit=_percent(s, "spell_hit"),
            haste=_percent(s, "spell_haste"),
            penetration=_whole(s, "spell_penetration"),
            mana_regen=_number(s, "mana_regen"),
            mana_regen_casting=_number(s, "mana_regen_combat"),
        ),
        defenses=CharacterDefenseStats(
            armor=_value(s, "armor"),
            defense=_value(s, "defense"),
            dodge=_percent(s, "dodge"),
            parry=_percent(s, "parry"),
            block=_percent(s, "block"),
        ),
        resistances=CharacterResistances(
            arcane=_value(s, "arcane_resistance").effective,
            fire=_value(s, "fire_resistance").effective,
            frost=_value(s, "frost_resistance").effective,
            nature=_value(s, "nature_resistance").effective,
            shadow=_value(s, "shadow_resistance").effective,
        ),
        movement_speed=as_float(s.get("movement_speed")) or _NORMAL_MOVEMENT_SPEED,
    )
