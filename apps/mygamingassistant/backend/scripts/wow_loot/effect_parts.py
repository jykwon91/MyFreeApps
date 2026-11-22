"""What casting a spell does, as parts (damage, heals, buffs, procs, no-value and unresolved markers),
before any rate or cooldown is applied. ``effect_values`` turns them into weight-key values."""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from scripts.wow_loot.effect_model import (
    ALL_MAGIC,
    AURA_ARMOR,
    AREA_AROUND_CASTER,
    AURA_ABSORB,
    AURA_ATTACK_POWER,
    AURA_DAMAGE_DONE,
    AURA_DAMAGE_SHIELD,
    AURA_DUMMY,
    AURA_EFFECTS,
    AURA_HEALING_DONE,
    AURA_PERIODIC_DAMAGE,
    AURA_PERIODIC_ENERGIZE,
    AURA_PERIODIC_HEAL,
    AURA_PERIODIC_LEECH,
    AURA_POWER_REGEN,
    AURA_PROC_TRIGGER_DAMAGE,
    AURA_RANGED_ATTACK_POWER,
    AURA_RESISTANCE,
    AURA_SPELL_PENETRATION,
    AURA_STAT,
    CASTER_TARGET,
    CONTROL_AURAS,
    CREATURE_SUMMON_EFFECTS,
    EFFECT_DUMMY,
    EFFECT_ENERGIZE,
    EFFECT_EXTRA_ATTACKS,
    EFFECT_HEAL,
    EFFECT_HEALTH_LEECH,
    EFFECT_LEARN_SPELL,
    EFFECT_NONE,
    EFFECT_SCHOOL_DAMAGE,
    EFFECT_TRIGGER_SPELL,
    ENEMY_TARGETS,
    FULL_CHANCE,
    HASTE_AURAS,
    MANA,
    MAX_DEPTH,
    MELEE_WEAPON_BITS,
    NO_VALUE_AURAS,
    NO_VALUE_EFFECTS,
    OUT_OF_COMBAT_EFFECTS,
    PERIODIC_TRIGGER_AURAS,
    PET_TARGET,
    PHYSICAL,
    PROC_AURAS,
    RANGED_ONLY_KEYS,
    RANGED_WEAPON_BITS,
    SCHOOL_RESISTANCE,
    SCHOOL_SPELL_DAMAGE,
    SCHOOLS,
    STAT_AURAS,
    STAT_BY_MISC,
    SUMMON_EFFECTS,
    PVP_AURAS,
    UNWEIGHTED_AURAS,
    ArmorCut,
    Buff,
    Control,
    Damage,
    EffectRow,
    ExtraAttacks,
    Heal,
    Mana,
    NoValue,
    PerSecond,
    Proc,
    ResistCut,
    Spell,
    Summon,
    Unresolved,
)


@dataclass
class _Ctx:
    book: Mapping[int, Spell]
    seen: set[int] = field(default_factory=set)


def _ticks(duration_ms: int, period_ms: int) -> int:
    return duration_ms // period_ms if duration_ms > 0 and period_ms > 0 else 0


def _beneficial(row: EffectRow) -> bool:
    if row.target == PET_TARGET:
        return False
    if row.target in ENEMY_TARGETS:
        return False
    return not (row.target == AREA_AROUND_CASTER and row.target2 in ENEMY_TARGETS)


def _restricted_key(spell: Spell, key: str) -> str | None:
    """The key for an aura limited to some weapons: ``ranged_`` for ranged-only, None when it can't be counted."""
    if spell.weapon_bits is None or spell.weapon_bits & MELEE_WEAPON_BITS == MELEE_WEAPON_BITS:
        return key
    if spell.weapon_bits & ~RANGED_WEAPON_BITS == 0 and key in RANGED_ONLY_KEYS:
        return RANGED_ONLY_KEYS[key]
    return None


def _stat_buffs(spell: Spell, row: EffectRow, paired_healing: bool) -> list[object]:
    """A plain stat aura on you, as buffs; [] when it isn't one."""
    amount = row.base
    duration = spell.duration_ms if spell.duration_ms > 0 else 0
    keys: list[str] = []
    if row.aura == AURA_STAT:
        keys = list(STAT_BY_MISC.values()) if row.misc == -1 else [STAT_BY_MISC[row.misc]] if row.misc in STAT_BY_MISC else []
    elif row.aura == AURA_DAMAGE_DONE:
        if row.misc & ALL_MAGIC == ALL_MAGIC:
            keys = ["spell_power" if paired_healing else "spell_damage"]
        elif row.misc in SCHOOL_SPELL_DAMAGE:
            keys = [SCHOOL_SPELL_DAMAGE[row.misc]]
    elif row.aura == AURA_RESISTANCE:
        if row.misc & PHYSICAL:
            keys.append("armor")
        if row.misc & ALL_MAGIC == ALL_MAGIC:
            keys.append("all_resistance")
        else:
            keys += [key for bit, key in SCHOOL_RESISTANCE.items() if row.misc & bit]
    elif row.aura == AURA_SPELL_PENETRATION and row.misc & ALL_MAGIC == ALL_MAGIC:
        keys, amount = ["spell_penetration"], -row.base
    elif row.aura == AURA_POWER_REGEN and row.misc == MANA:
        keys = ["mp5"]
    elif row.aura == AURA_ATTACK_POWER:
        keys = ["feral_attack_power" if spell.shapeshift else "attack_power"]
    elif row.aura in STAT_AURAS:
        keys = [STAT_AURAS[row.aura]]
    parts: list[object] = []
    for key in keys:
        restricted = _restricted_key(spell, key)
        if restricted is None:
            return [Unresolved(f"{spell.name}: works only with some weapon types")]
        parts.append(Buff(restricted, amount, duration))
    return parts


def spell_parts(spell_id: int, book: Mapping[int, Spell], _ctx: _Ctx | None = None, depth: int = 0) -> list[object]:
    """What casting ``spell_id`` does, as parts (damage, heals, buffs, procs, no-value and unresolved markers)."""
    ctx = _ctx or _Ctx(book)
    spell = book.get(spell_id)
    if spell is None:
        return [Unresolved(f"spell {spell_id} isn't in the client data")]
    if depth > MAX_DEPTH or spell_id in ctx.seen:
        return [Unresolved(f"{spell.name}: triggers itself")]
    ctx.seen.add(spell_id)
    try:
        return _parts(spell, ctx, depth)
    finally:
        ctx.seen.discard(spell_id)


def _parts(spell: Spell, ctx: _Ctx, depth: int) -> list[object]:
    real_triggers = {r.trigger for r in spell.effects if r.trigger and r.effect != EFFECT_DUMMY and r.aura != AURA_DUMMY}
    healing_pairs = {r.base for r in spell.effects if r.aura == AURA_HEALING_DONE}
    melee_ap = {r.base for r in spell.effects if r.aura == AURA_ATTACK_POWER}
    spell_power = {
        r.base for r in spell.effects if r.aura == AURA_DAMAGE_DONE and r.misc & ALL_MAGIC == ALL_MAGIC and r.base in healing_pairs
    }
    parts: list[object] = []
    for row in spell.effects:
        if row.effect == EFFECT_NONE:
            continue
        is_dummy = row.effect == EFFECT_DUMMY or (row.effect in AURA_EFFECTS and row.aura == AURA_DUMMY)
        if is_dummy and row.trigger and row.trigger in real_triggers:
            continue  # the tooltip's copy of a real proc
        if row.aura == AURA_HEALING_DONE and row.base in spell_power:
            continue  # counted with its damage half as spell power
        if row.aura == AURA_RANGED_ATTACK_POWER and row.base in melee_ap and not spell.shapeshift:
            continue  # with the same melee attack power it's plain attack power, which counts for ranged too
        parts += _row_parts(spell, row, ctx, depth, row.base in spell_power)
    return parts


def _row_parts(spell: Spell, row: EffectRow, ctx: _Ctx, depth: int, paired_healing: bool) -> list[object]:
    school = SCHOOLS.get(spell.school_mask, "")
    if row.effect in (EFFECT_SCHOOL_DAMAGE, EFFECT_HEALTH_LEECH):
        if row.target == CASTER_TARGET:
            return [Unresolved(f"{spell.name}: hurts you")]
        return [Damage(row.base, school)]
    if row.effect == EFFECT_HEAL:
        return [Heal(row.base)]
    if row.effect == EFFECT_ENERGIZE:
        return [Mana(row.base)] if row.misc == MANA else [Unresolved(f"{spell.name}: restores rage or energy, which has no weight")]
    if row.effect == EFFECT_EXTRA_ATTACKS:
        return [ExtraAttacks(row.base)]
    if row.effect == EFFECT_TRIGGER_SPELL and row.trigger:
        return spell_parts(row.trigger, ctx.book, ctx, depth + 1)
    if row.effect in NO_VALUE_EFFECTS or row.effect in OUT_OF_COMBAT_EFFECTS:
        return [NoValue(spell.name)]
    if row.effect in CREATURE_SUMMON_EFFECTS:
        creature = next((c for c in spell.creatures if c.id == row.misc), None)
        if creature is None:
            return [Unresolved(f"{spell.name}: summons creature {row.misc}, which the data doesn't have")]
        if not creature.fights:
            return [NoValue(spell.name)]
        return [Summon(creature, spell.duration_ms)]
    if row.effect in SUMMON_EFFECTS:
        return [Unresolved(f"{spell.name}: summons something, which has no stat equivalent")]
    if row.effect == EFFECT_LEARN_SPELL:
        return [Unresolved(f"{spell.name}: teaches a spell the data can't value")]
    if row.effect in AURA_EFFECTS:
        return _aura_parts(spell, row, ctx, depth, paired_healing, school)
    return [Unresolved(f"{spell.name}: a scripted effect the data can't resolve")]


def _aura_parts(spell: Spell, row: EffectRow, ctx: _Ctx, depth: int, paired_healing: bool, school: str) -> list[object]:
    aura = row.aura
    duration = spell.duration_ms if spell.duration_ms > 0 else 0
    if aura in NO_VALUE_AURAS:
        return [NoValue(spell.name)]
    if aura in (AURA_PERIODIC_DAMAGE, AURA_PERIODIC_LEECH):
        ticks = _ticks(duration, row.period_ms)
        return [Damage(row.base * ticks, school)] if ticks else [Unresolved(f"{spell.name}: damage over time with no duration")]
    if row.target == PET_TARGET:
        return [Unresolved(f"{spell.name}: affects your pet")]
    if aura == AURA_PERIODIC_HEAL:
        if duration == 0 and row.period_ms > 0:
            return [PerSecond("heal", row.base * 1000 / row.period_ms, 0)]
        ticks = _ticks(duration, row.period_ms)
        return [Heal(row.base * ticks)] if ticks else [Unresolved(f"{spell.name}: healing over time with no duration")]
    if aura == AURA_PERIODIC_ENERGIZE and row.misc == MANA and row.period_ms > 0:
        return [PerSecond("mp5", row.base * 5000 / row.period_ms, duration)]
    if aura in PERIODIC_TRIGGER_AURAS and row.trigger:
        ticks = _ticks(duration, row.period_ms)
        if not ticks:
            return [Unresolved(f"{spell.name}: repeats with no duration")]
        return [_scaled(p, ticks) for p in spell_parts(row.trigger, ctx.book, ctx, depth + 1)]
    if aura in PROC_AURAS and row.trigger:
        inner = tuple(spell_parts(row.trigger, ctx.book, ctx, depth + 1))
        return [_proc(spell, inner)]
    if aura == AURA_PROC_TRIGGER_DAMAGE:
        return [_proc(spell, (Damage(row.base, school),))]
    if aura == AURA_DAMAGE_SHIELD and _beneficial(row):
        return [PerSecond("shield_damage", row.base, duration)]
    if aura == AURA_ABSORB and _beneficial(row):
        return [Heal(row.base, absorb=True)]
    if not _beneficial(row):
        return _enemy_parts(spell, row, duration)
    if aura in UNWEIGHTED_AURAS:
        return [Unresolved(f"{spell.name}: {UNWEIGHTED_AURAS[aura]}", pvp=aura in PVP_AURAS)]
    if row.base < 0:
        return [Unresolved(f"{spell.name}: a penalty on you the data can't resolve")]
    if spell.proc_charges > 0:
        return [Unresolved(f"{spell.name}: lasts only {spell.proc_charges} hits or spells")]
    if aura == AURA_DAMAGE_DONE and row.misc == PHYSICAL:
        return [PerSecond("hit_damage", row.base, duration)]
    buffs = _stat_buffs(spell, row, paired_healing)
    if buffs:
        return buffs
    return [Unresolved(f"{spell.name}: a scripted effect the data can't resolve")]


def _enemy_parts(spell: Spell, row: EffectRow, duration: int) -> list[object]:
    """An aura on the enemy: control, an armor or resistance cut, or unresolved."""
    aura = row.aura
    if aura in CONTROL_AURAS or (aura in HASTE_AURAS and row.base < 0):
        return [Control(spell.name)]
    if aura == AURA_ARMOR and row.base < 0:
        return [ArmorCut(-row.base, duration)]
    if aura == AURA_RESISTANCE and row.base < 0:
        parts: list[object] = [ArmorCut(-row.base, duration)] if row.misc & PHYSICAL else []
        schools = tuple(SCHOOLS[bit] for bit in sorted(SCHOOLS) if bit != PHYSICAL and row.misc & bit)
        if schools:
            parts.append(ResistCut(spell.name, schools, -row.base))
        return parts
    return [Unresolved(f"{spell.name}: works on the enemy, which has no stat equivalent")]


def _proc(spell: Spell, parts: tuple) -> Proc:
    return Proc(
        spell.name, spell.proc_chance, spell.ppm, spell.proc_icd_ms, parts, spell.classic_ppm, spell.classic_chance,
        cast=spell.cast_proc, chance_unknown=spell.chance_worded and spell.proc_chance == FULL_CHANCE,
        when_hit=spell.when_hit,
    )


def _scaled(part: object, times: int) -> object:
    if isinstance(part, Damage):
        return Damage(part.amount * times, part.school)
    if isinstance(part, Heal):
        return Heal(part.amount * times, part.absorb)
    if isinstance(part, Mana):
        return Mana(part.amount * times)
    if isinstance(part, (NoValue, Unresolved, Control)):
        return part
    return Unresolved("a repeating buff the data can't resolve")
