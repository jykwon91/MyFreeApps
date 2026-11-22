"""Class spells as an item's spell modifier sees them: what each one deals or heals, how often, and for whom.

An item aura that changes class spells (``SPELL_AURA_ADD_FLAT_MODIFIER`` 107 / ``ADD_PCT_MODIFIER`` 108) names
them by spell family and class mask: ``SpellClassOptions.SpellClassSet`` is the family, and a spell is changed when
its ``SpellClassMask_i`` shares a bit with the aura effect's ``EffectSpellClassMask_i``. The spell's owning class
is ``SkillLineAbility.ClassMask``. Of a spell's ranks, the top one learned by level 60 (``SpellLevels.BaseLevel``)
is the one counted.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

MAX_LEVEL = 60
# SpellClassOptions.SpellClassSet -> the class it belongs to.
FAMILY_CLASS = {
    3: "mage", 4: "warrior", 5: "warlock", 6: "priest", 7: "druid", 8: "rogue", 9: "hunter", 10: "paladin",
    11: "shaman",
}
# SkillLineAbility.ClassMask bit for each class (ChrClasses id - 1).
CLASS_BIT = {
    "warrior": 1, "paladin": 2, "hunter": 4, "rogue": 8, "priest": 16, "shaman": 64, "mage": 128,
    "warlock": 256, "druid": 1024,
}
# SpellEffect.Effect: school damage, health leech, heal; and the weapon-damage effects, whose damage is your weapon's.
DIRECT_DAMAGE_EFFECTS = frozenset({2, 9})
DIRECT_HEAL_EFFECTS = frozenset({10})
WEAPON_DAMAGE_EFFECTS = frozenset({17, 31, 58, 121})
APPLY_AURA = 6
# Periodic damage, periodic heal, periodic leech.
PERIODIC_DAMAGE_AURAS = frozenset({3, 53})
PERIODIC_HEAL_AURAS = frozenset({8})
MANA_POWER = 0


@dataclass(frozen=True)
class ClassSpell:
    id: int
    name: str
    family: int
    masks: tuple[int, int, int, int]
    cls: str
    school_mask: int = 0
    cast_ms: int = 0
    cooldown_ms: int = 0
    mana_cost: int = 0
    # A cost in percent of your base mana (SpellPower.PowerCostPct), which depends on your character.
    mana_pct: float = 0
    # Per cast: the direct damage or heal, and each periodic tick and how many there are.
    direct: float = 0
    tick: float = 0
    ticks: int = 0
    heals: bool = False
    weapon: bool = False

    @property
    def per_cast(self) -> float:
        return self.direct + self.tick * self.ticks


def changed_spells(spells: Iterable[ClassSpell], family: int, mask: tuple[int, int, int, int]) -> list[ClassSpell]:
    """The spells a modifier with this family and class mask changes, by name in id order."""
    return sorted(
        (s for s in spells if s.family == family and any(a & b for a, b in zip(s.masks, mask))),
        key=lambda s: (s.name, s.id),
    )


Row = Mapping[str, str]


def _int(value: str | None) -> int:
    return int(float(value)) if value not in (None, "") else 0


def _by_spell(rows: Iterable[Row]) -> dict[int, Row]:
    return {_int(r["SpellID"]): r for r in rows if r.get("DifficultyID", "0") == "0"}


def class_spells(
    options: Iterable[Row],
    abilities: Iterable[Row],
    names: Mapping[int, str],
    effects: Mapping[int, list[Row]],
    misc: Iterable[Row],
    cast_times: Iterable[Row],
    durations: Mapping[int, int],
    cooldowns: Iterable[Row],
    levels: Iterable[Row],
    power: Iterable[Row],
) -> tuple[ClassSpell, ...]:
    """Every family spell its family's class learns, at its top rank by level 60."""
    class_masks: dict[int, int] = {}
    for row in abilities:
        class_masks[_int(row["Spell"])] = class_masks.get(_int(row["Spell"]), 0) | _int(row["ClassMask"])
    misc_by = _by_spell(misc)
    casts = {_int(r["ID"]): _int(r["Base"]) for r in cast_times}
    cooldown_by = _by_spell(cooldowns)
    level_by = _by_spell(levels)
    mana: dict[int, tuple[int, float]] = {}
    for row in power:
        if _int(row["PowerType"]) == MANA_POWER and _int(row["OrderIndex"]) == 0:
            mana[_int(row["SpellID"])] = (_int(row["ManaCost"]), float(row["PowerCostPct"] or 0))
    top: dict[tuple[int, str], tuple[int, ClassSpell]] = {}
    for row in options:
        spell_id, family = _int(row["SpellID"]), _int(row["SpellClassSet"])
        cls = FAMILY_CLASS.get(family)
        if not cls or not class_masks.get(spell_id, 0) & CLASS_BIT[cls]:
            continue
        level = _int(level_by.get(spell_id, {}).get("BaseLevel"))
        if level > MAX_LEVEL:
            continue
        spell = _class_spell(spell_id, names.get(spell_id, f"spell {spell_id}"), family, row, cls, effects.get(spell_id, []),
                             misc_by.get(spell_id, {}), casts, durations, cooldown_by.get(spell_id, {}), mana.get(spell_id, (0, 0.0)))
        key = (family, spell.name)
        if key not in top or (level, spell_id) > (top[key][0], top[key][1].id):
            top[key] = (level, spell)
    return tuple(spell for _, spell in sorted(top.values(), key=lambda t: t[1].id))


def _class_spell(
    spell_id: int, name: str, family: int, option: Row, cls: str, rows: list[Row], misc: Row,
    casts: Mapping[int, int], durations: Mapping[int, int], cooldown: Row, mana: tuple[int, float],
) -> ClassSpell:
    direct = tick = 0.0
    ticks = 0
    heals = weapon = False
    duration = durations.get(_int(misc.get("DurationIndex")), 0)
    for row in rows:
        effect, aura, base = _int(row["Effect"]), _int(row["EffectAura"]), float(row["EffectBasePointsF"] or 0)
        period = _int(row["EffectAuraPeriod"])
        if effect in WEAPON_DAMAGE_EFFECTS:
            weapon = True
        elif effect in DIRECT_DAMAGE_EFFECTS | DIRECT_HEAL_EFFECTS and base > 0:
            direct += base
            heals = heals or effect in DIRECT_HEAL_EFFECTS
        elif effect == APPLY_AURA and aura in PERIODIC_DAMAGE_AURAS | PERIODIC_HEAL_AURAS and base > 0 and period > 0:
            if duration > 0:
                tick, ticks = tick + base, duration // period
            heals = heals or aura in PERIODIC_HEAL_AURAS
    return ClassSpell(
        id=spell_id, name=name, family=family, cls=cls,
        masks=(_int(option["SpellClassMask_0"]), _int(option["SpellClassMask_1"]),
               _int(option["SpellClassMask_2"]), _int(option["SpellClassMask_3"])),
        school_mask=_int(misc.get("SchoolMask")),
        cast_ms=max(0, casts.get(_int(misc.get("CastingTimeIndex")), 0)),
        cooldown_ms=max(_int(cooldown.get("RecoveryTime")), _int(cooldown.get("CategoryRecoveryTime"))),
        mana_cost=mana[0], mana_pct=mana[1], direct=direct, tick=tick, ticks=ticks, heals=heals, weapon=weapon,
    )
