"""What an item's Use, Chance on hit and Equip effects are worth, in MGA Loot's stat-weight keys.

Pure functions over client spell rows; ``item_effects.py`` loads the tables and writes the JSON.
Every conversion turns an effect into a steady per-fight equivalent of a stat the weights know:

* **On use, stat buff:** ``stat × duration / max(cooldown, duration)`` — the buff's average over its cooldown.
* **On use, damage or heal:** ``amount / cooldown`` → ``dps`` (weighed like weapon DPS) or ``healing`` (HPS).
  Mana restored becomes ``mp5`` (``amount × 5 / cooldown``); an absorb shield counts as healing.
* **Chance on hit, damage:** ``damage × procs per second``. Procs per second are ``PPM / 60`` when the spell
  has a procs-per-minute rate (``SpellAuraOptions.SpellProcsPerMinuteID`` → ``SpellProcsPerMinute``); otherwise
  ``ProcChance% × hits per second``, with hits per second ``1 / weapon speed`` for a weapon and, for anything
  else, one hit every ``ASSUMED_SECONDS_PER_HIT`` seconds (an assumption, stated in each note it touches).
  A chance-on-hit item spell whose client data has neither (``ProcChance`` 101 is "not set") takes the item's
  PPM from cmangos classic-db's ``item_template.spellppmRate`` — the client carries none — and the note says
  "Classic rate" (an item Forever gave a renumbered proc spell takes it when both sides have exactly one
  chance on hit). An Equip proc aura with no client rate likewise takes cmangos' ``spell_proc_event``
  ``ppmRate`` / ``CustomChance`` for that aura spell. With no rate anywhere the effect is unresolved: no rate is
  ever made up — ``ProcChance`` 101 ("not set") is never read as a number.
  An internal cooldown (``SpellAuraOptions.ProcCategoryRecovery``) caps the rate.
* **Chance on hit, buff:** ``stat × uptime``, ``uptime = min(1, procs per second × duration)``.
* **Extra attacks:** ``dps_pct`` — the share of weapon DPS they add (``attacks × chance per swing``): the
  addon multiplies it by the item's own DPS for a weapon, by your main hand's for anything else.
* **Flat damage per hit** (``+10 damage`` auras, damage shields): damage × hits per second → ``dps``; a damage
  shield counts the assumed hit rate as hits you take.
* **Equip auras** GetItemStats doesn't already give (it gives ItemSparse's stat lines): the weight key
  straight (attack speed → ``haste_pct``, casting speed → ``spell_haste_pct``, mana per 5 → ``mp5``, armor,
  resistances, hit / crit / dodge / parry / block chance). An aura limited to ranged weapons gets a
  ``ranged_`` key, which the addon counts only for weights that value ranged DPS over melee.
* **No combat value** (water breathing, run / swim / mount speed, stealth, safe fall, illusions...): value 0,
  note "no combat value".
* **Unresolved:** scripted (dummy) spells, effects on the enemy (slows, stuns, armor or resistance cuts),
  effects on your pet, class-spell modifiers, summons, rage / energy, buffs that last a set number of hits,
  and anything the data gives no rate, cooldown or duration for. The addon says it can't judge those.

A dummy effect that triggers the same spell as a real effect in the same spell (Hand of Justice's tooltip
copy of its proc) adds nothing and is skipped.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

# A non-weapon item's "chance per hit" is counted at one hit (or spell cast, or hit taken) every this many seconds.
ASSUMED_SECONDS_PER_HIT = 2.5

# ItemEffect.TriggerType
TRIGGER_ON_USE = 0
TRIGGER_ON_EQUIP = 1
TRIGGER_CHANCE_ON_HIT = 2
TRIGGER_ON_USE_NO_DELAY = 5
USE_TRIGGERS = frozenset({TRIGGER_ON_USE, TRIGGER_ON_USE_NO_DELAY})

# SpellEffect.Effect
EFFECT_NONE = 0
EFFECT_SCHOOL_DAMAGE = 2
EFFECT_DUMMY = 3
EFFECT_APPLY_AURA = 6
EFFECT_HEALTH_LEECH = 9
EFFECT_HEAL = 10
EFFECT_EXTRA_ATTACKS = 19
EFFECT_CREATE_ITEM = 24
EFFECT_ENERGIZE = 30
EFFECT_TRIGGER_SPELL = 64
EFFECT_TELEPORT = 252
AURA_EFFECTS = frozenset({EFFECT_APPLY_AURA, 35, 65, 128, 143})  # aura, party / raid / friend / owner area aura
# 5 teleport units, 50 portal / object, 100 drunkenness
NO_VALUE_EFFECTS = frozenset({EFFECT_CREATE_ITEM, EFFECT_TELEPORT, 5, 50, 100})

# SpellEffect.EffectAura
AURA_PERIODIC_DAMAGE = 3
AURA_DUMMY = 4
AURA_PERIODIC_HEAL = 8
AURA_DAMAGE_DONE = 13
AURA_DAMAGE_SHIELD = 15
AURA_RESISTANCE = 22
AURA_PERIODIC_TRIGGER = 23
AURA_PERIODIC_ENERGIZE = 24
AURA_STAT = 29
AURA_PROC_TRIGGER = 42
AURA_PROC_TRIGGER_DAMAGE = 43
AURA_PERIODIC_LEECH = 53
AURA_ABSORB = 69
AURA_POWER_REGEN = 85
AURA_ATTACK_POWER = 99
AURA_SPELL_PENETRATION = 123
AURA_RANGED_ATTACK_POWER = 124
AURA_HEALING_DONE = 135
AURA_RANGED_HASTE = 140
AURA_PERIODIC_DUMMY = 226
AURA_PERIODIC_TRIGGER_WITH_VALUE = 227
AURA_PROC_TRIGGER_WITH_VALUE = 231
AURA_ARMOR = 674  # Forever's flat armor aura (Sword of Zeal's "+150 armor").
PERIODIC_TRIGGER_AURAS = frozenset({AURA_PERIODIC_TRIGGER, AURA_PERIODIC_TRIGGER_WITH_VALUE})
PROC_AURAS = frozenset({AURA_PROC_TRIGGER, AURA_PROC_TRIGGER_WITH_VALUE})
# Aura -> weight key, for auras that are a plain stat.
STAT_AURAS: dict[int, str] = {
    47: "parry_pct",
    49: "dodge_pct",
    51: "block_pct",
    52: "crit_pct",
    54: "hit_pct",
    55: "spell_hit_pct",
    57: "spell_crit_pct",
    65: "spell_haste_pct",
    AURA_ATTACK_POWER: "attack_power",
    AURA_RANGED_ATTACK_POWER: "ranged_attack_power",
    AURA_HEALING_DONE: "healing",
    AURA_RANGED_HASTE: "ranged_haste_pct",
    192: "haste_pct",
    319: "haste_pct",
    342: "haste_pct",
    AURA_ARMOR: "armor",
}
PERCENT_KEYS = frozenset(k for k in STAT_AURAS.values() if k.endswith("_pct"))
# Auras that do nothing in a fight.
NO_VALUE_AURAS = frozenset({
    17, 31, 32, 44, 45, 56, 58, 61, 75, 82, 104, 105, 129, 130, 144, 151, 154, 155, 156, 171, 172, 190, 200,
    206, 207, 208, 209, 210, 211,
})
# Classic stat order (AURA_STAT misc value); -1 is all of them.
STAT_BY_MISC = {0: "strength", 1: "agility", 2: "stamina", 3: "intellect", 4: "spirit"}
# Spell school bits, as in SpellMisc.SchoolMask and the damage / resistance auras' misc value.
SCHOOLS = {1: "Physical", 2: "Holy", 4: "Fire", 8: "Nature", 16: "Frost", 32: "Shadow", 64: "Arcane"}
PHYSICAL = 1
ALL_MAGIC = 126
SCHOOL_SPELL_DAMAGE = {2: "holy_spell_damage", 4: "fire_spell_damage", 8: "nature_spell_damage",
                       16: "frost_spell_damage", 32: "shadow_spell_damage", 64: "arcane_spell_damage"}
SCHOOL_RESISTANCE = {4: "fire_resistance", 8: "nature_resistance", 16: "frost_resistance",
                     32: "shadow_resistance", 64: "arcane_resistance"}
MANA = 0
# SpellEffect.ImplicitTarget values that put an effect on the enemy, and on your pet.
ENEMY_TARGETS = frozenset({6, 15, 16, 24, 53, 54, 77, 87, 104})
AREA_AROUND_CASTER = 22
PET_TARGET = 5
CASTER_TARGET = 1
# Weapon subclass bits (SpellEquippedItems.EquippedItemSubclass) for an aura that only works with some weapons.
WEAPON_CLASS = 2
RANGED_WEAPON_BITS = sum(1 << s for s in (2, 3, 16, 18, 19))
MELEE_WEAPON_BITS = sum(1 << s for s in (0, 1, 4, 5, 6, 7, 8, 10, 13, 15))
RANGED_ONLY_KEYS = {"hit_pct": "ranged_hit_pct", "crit_pct": "ranged_crit_pct", "haste_pct": "ranged_haste_pct"}
MAX_DEPTH = 4
NO_RATE = 101  # SpellAuraOptions.ProcChance when a spell sets none.
# Auras on you that change something MGA Loot's stat weights have no key for.
UNWEIGHTED_AURAS: dict[int, str] = {
    10: "changes your threat, which has no stat weight",
    14: "changes the damage you take, which has no stat weight",
    30: "raises a skill, which has no stat weight",
    72: "changes your spells' mana cost, which has no stat weight",
    73: "changes your spells' mana cost, which has no stat weight",
    77: "an immunity, which has no stat weight",
    84: "regenerates health, which has no stat weight",
    87: "changes the damage you take, which has no stat weight",
    107: "changes one of your class spells, which has no stat equivalent",
    108: "changes one of your class spells, which has no stat equivalent",
    117: "resists a kind of crowd control, which has no stat weight",
    232: "shortens crowd control on you, which has no stat weight",
}
# SpellEffect.Effect values that summon something (creatures, totems, guardians, objects).
SUMMON_EFFECTS = frozenset({28, 34, 41, 56, 87, 97, 98, 104, 105, 106, 107, 112})
EFFECT_LEARN_SPELL = 36


@dataclass(frozen=True)
class EffectRow:
    effect: int
    aura: int
    base: float
    misc: int
    period_ms: int
    trigger: int
    target: int
    target2: int = 0


@dataclass(frozen=True)
class Spell:
    id: int
    name: str
    school_mask: int = 0
    duration_ms: int = 0
    proc_chance: float = 0
    ppm: float = 0
    proc_icd_ms: int = 0
    proc_charges: int = 0
    cooldown_ms: int = 0
    category_cooldown_ms: int = 0
    shapeshift: bool = False
    # SpellEquippedItems for a weapon-only aura: the weapon subclass bits it works with; None when unlimited.
    weapon_bits: int | None = None
    effects: tuple[EffectRow, ...] = ()
    # cmangos classic-db spell_proc_event for this proc aura: only used when the client gives it no rate.
    classic_ppm: float = 0
    classic_chance: float = 0


@dataclass(frozen=True)
class Item:
    id: int
    # Seconds per swing for a weapon (ItemSparse.ItemDelay); None for anything else.
    weapon_speed: float | None = None
    # Weight keys GetItemStats already gives for this item (its ItemSparse stat lines).
    stat_keys: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ItemSpell:
    spell_id: int
    trigger: int
    cooldown_ms: int = 0
    category_cooldown_ms: int = 0
    # cmangos classic-db item_template.spellppmRate for this item spell: only for chance-on-hit gaps.
    classic_ppm: float = 0


@dataclass(frozen=True)
class Entry:
    """One line of an item's effect data: ``value`` of weight key ``stat``, or a ``none`` / ``unresolved`` marker."""

    stat: str
    value: float
    note: str


NONE = "none"
UNRESOLVED = "unresolved"


# --- What a spell does, before any rate or cooldown is applied ---------------------------------


@dataclass(frozen=True)
class Damage:
    amount: float
    school: str


@dataclass(frozen=True)
class Heal:
    amount: float
    absorb: bool = False


@dataclass(frozen=True)
class Mana:
    amount: float


@dataclass(frozen=True)
class Buff:
    """``amount`` of a weight key for ``duration_ms`` (0 = as long as it's worn)."""

    stat: str
    amount: float
    duration_ms: int


@dataclass(frozen=True)
class PerSecond:
    """A steady rate while it lasts: healing per second, mana per 5, damage per hit taken or dealt."""

    kind: str  # "heal" | "mp5" | "hit_damage" | "shield_damage"
    amount: float
    duration_ms: int


@dataclass(frozen=True)
class ExtraAttacks:
    count: float


@dataclass(frozen=True)
class Proc:
    """A proc aura: on each hit, ``chance`` % (or ``ppm`` per minute) to cast ``parts``."""

    spell: str
    chance: float
    ppm: float
    icd_ms: int
    parts: tuple
    classic_ppm: float = 0
    classic_chance: float = 0


@dataclass(frozen=True)
class NoValue:
    name: str


@dataclass(frozen=True)
class Unresolved:
    reason: str


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
    if row.effect in NO_VALUE_EFFECTS:
        return [NoValue(spell.name)]
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
        return [Unresolved(f"{spell.name}: works on the enemy, which has no stat equivalent")]
    if aura in UNWEIGHTED_AURAS:
        return [Unresolved(f"{spell.name}: {UNWEIGHTED_AURAS[aura]}")]
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


def _proc(spell: Spell, parts: tuple) -> Proc:
    return Proc(spell.name, spell.proc_chance, spell.ppm, spell.proc_icd_ms, parts, spell.classic_ppm, spell.classic_chance)


def _scaled(part: object, times: int) -> object:
    if isinstance(part, Damage):
        return Damage(part.amount * times, part.school)
    if isinstance(part, Heal):
        return Heal(part.amount * times, part.absorb)
    if isinstance(part, Mana):
        return Mana(part.amount * times)
    if isinstance(part, (NoValue, Unresolved)):
        return part
    return Unresolved("a repeating buff the data can't resolve")


# --- Turning parts into weight-key values ------------------------------------------------------


def _num(value: float) -> str:
    """A number for a note: whole when it is, else one decimal (two under 1)."""
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    text = f"{value:.2f}" if abs(value) < 1 else f"{value:.1f}"
    return text.rstrip("0").rstrip(".")


def _round(value: float) -> float:
    return round(value, 3)


def _duration(ms: int) -> str:
    seconds = ms / 1000
    if seconds >= 60 and seconds % 60 == 0:
        return f"{int(seconds // 60)}min"
    return f"{_num(seconds)}s"


def stat_label(key: str) -> str:
    """``crit_pct`` -> ``% crit``, ``attack_power`` -> ``attack power``."""
    if key.endswith("_pct"):
        return "% " + key[: -len("_pct")].replace("_", " ")
    return key.replace("_", " ")


def _amount_text(key: str, amount: float) -> str:
    sign = "+" if amount >= 0 else ""
    if key.endswith("_pct"):
        return f"{sign}{_num(amount)}{stat_label(key)}"
    return f"{sign}{_num(amount)} {stat_label(key)}"


@dataclass(frozen=True)
class Rate:
    per_second: float
    text: str  # "1 PPM", "6% per hit", "1.8 PPM (Classic rate)"


def _hit_seconds(item: Item) -> tuple[float, str]:
    if item.weapon_speed:
        return item.weapon_speed, ""
    return ASSUMED_SECONDS_PER_HIT, f", assuming a hit every {_num(ASSUMED_SECONDS_PER_HIT)}s"


def proc_rate(
    item: Item, chance: float, ppm: float, icd_ms: int, classic_ppm: float = 0, classic_chance: float = 0,
) -> Rate | None:
    """Procs per second, or None when the data gives no rate. Forever's rate first, then cmangos' Classic one."""
    if ppm > 0:
        rate = Rate(ppm / 60, f"{_num(ppm)} PPM")
    elif 0 < chance < NO_RATE:
        seconds, assumed = _hit_seconds(item)
        rate = Rate(chance / 100 / seconds, f"{_num(chance)}% per hit{assumed}")
    elif classic_ppm > 0:
        rate = Rate(classic_ppm / 60, f"{_num(classic_ppm)} PPM (Classic rate)")
    elif 0 < classic_chance <= 100:
        seconds, assumed = _hit_seconds(item)
        rate = Rate(classic_chance / 100 / seconds, f"{_num(classic_chance)}% per hit (Classic rate){assumed}")
    else:
        return None
    if icd_ms > 0 and rate.per_second > 1000 / icd_ms:
        rate = Rate(1000 / icd_ms, f"{rate.text}, capped by its {_duration(icd_ms)} cooldown")
    return rate


def _proc_entries(item: Item, parts: tuple | list, rate: Rate, prefix: str) -> list[Entry]:
    """Entries for what a proc casts, at ``rate`` procs per second."""
    entries: list[Entry] = []
    seconds_per_hit, _ = _hit_seconds(item)
    for part in parts:
        if isinstance(part, Damage):
            dps = part.amount * rate.per_second
            school = f" {part.school}" if part.school else ""
            entries.append(Entry("dps", _round(dps), f"{prefix}: {_num(part.amount)}{school} dmg at {rate.text} → +{_num(dps)} DPS"))
        elif isinstance(part, Heal):
            hps = part.amount * rate.per_second
            what = "absorbs" if part.absorb else "heals"
            entries.append(Entry("healing", _round(hps), f"{prefix}: {what} {_num(part.amount)} at {rate.text} → +{_num(hps)} healing (HPS)"))
        elif isinstance(part, Mana):
            mp5 = part.amount * rate.per_second * 5
            entries.append(Entry("mp5", _round(mp5), f"{prefix}: {_num(part.amount)} mana at {rate.text} → +{_num(mp5)} mp5"))
        elif isinstance(part, Buff):
            if part.duration_ms <= 0:
                entries.append(Entry(UNRESOLVED, 0, f"{prefix}: a buff with no duration"))
                continue
            uptime = min(1.0, rate.per_second * part.duration_ms / 1000)
            value = part.amount * uptime
            entries.append(Entry(part.stat, _round(value), f"{prefix}: {_amount_text(part.stat, part.amount)} for {_duration(part.duration_ms)} at {rate.text} → {_amount_text(part.stat, value)}"))
        elif isinstance(part, PerSecond) and part.kind == "hit_damage" and part.duration_ms > 0:
            uptime = min(1.0, rate.per_second * part.duration_ms / 1000)
            dps = part.amount / seconds_per_hit * uptime
            entries.append(Entry("dps", _round(dps), f"{prefix}: +{_num(part.amount)} damage per hit for {_duration(part.duration_ms)} at {rate.text} → +{_num(dps)} DPS"))
        elif isinstance(part, ExtraAttacks):
            share = part.count * rate.per_second * seconds_per_hit
            entries.append(Entry("dps_pct", _round(share), f"{prefix}: {_num(part.count)} extra attack{'s' if part.count != 1 else ''} at {rate.text} → +{_num(share * 100)}% weapon DPS"))
        elif isinstance(part, NoValue):
            continue
        elif isinstance(part, Unresolved):
            entries.append(Entry(UNRESOLVED, 0, part.reason))
        else:
            entries.append(Entry(UNRESOLVED, 0, f"{prefix}: an effect inside a proc the data can't resolve"))
    return entries


def _use_cooldown(effect: ItemSpell, spell: Spell) -> int:
    own = max(effect.cooldown_ms, spell.cooldown_ms)
    return own if own > 0 else max(effect.category_cooldown_ms, spell.category_cooldown_ms)


def _use_entries(item: Item, effect: ItemSpell, spell: Spell, parts: list[object]) -> list[Entry]:
    cooldown = _use_cooldown(effect, spell)
    valued = [p for p in parts if not isinstance(p, (NoValue, Unresolved))]
    if valued and cooldown <= 0:
        return [Entry(UNRESOLVED, 0, f"{spell.name}: no cooldown in the data")]
    every = f"every {_duration(cooldown)}" if cooldown > 0 else ""
    entries: list[Entry] = []
    for part in parts:
        if isinstance(part, Damage):
            dps = part.amount / (cooldown / 1000)
            school = f" {part.school}" if part.school else ""
            entries.append(Entry("dps", _round(dps), f"use: {_num(part.amount)}{school} dmg {every} → +{_num(dps)} DPS"))
        elif isinstance(part, Heal):
            hps = part.amount / (cooldown / 1000)
            what = "absorbs" if part.absorb else "heals"
            entries.append(Entry("healing", _round(hps), f"use: {what} {_num(part.amount)} {every} → +{_num(hps)} healing (HPS)"))
        elif isinstance(part, Mana):
            mp5 = part.amount * 5 / (cooldown / 1000)
            entries.append(Entry("mp5", _round(mp5), f"use: {_num(part.amount)} mana {every} → +{_num(mp5)} mp5"))
        elif isinstance(part, Buff) or (isinstance(part, PerSecond) and part.kind == "mp5"):
            stat = part.stat if isinstance(part, Buff) else "mp5"
            if part.duration_ms <= 0:
                entries.append(Entry(UNRESOLVED, 0, f"{spell.name}: a buff with no duration"))
                continue
            value = part.amount * part.duration_ms / max(cooldown, part.duration_ms)
            entries.append(Entry(stat, _round(value), f"use: {_amount_text(stat, part.amount)} for {_duration(part.duration_ms)} {every} → {_amount_text(stat, value)}"))
        elif isinstance(part, PerSecond) and part.kind == "hit_damage" and part.duration_ms > 0:
            seconds_per_hit, assumed = _hit_seconds(item)
            dps = part.amount / seconds_per_hit * part.duration_ms / max(cooldown, part.duration_ms)
            entries.append(Entry("dps", _round(dps), f"use: +{_num(part.amount)} damage per hit for {_duration(part.duration_ms)} {every}{assumed} → +{_num(dps)} DPS"))
        elif isinstance(part, NoValue):
            continue
        elif isinstance(part, Unresolved):
            entries.append(Entry(UNRESOLVED, 0, part.reason))
        else:
            entries.append(Entry(UNRESOLVED, 0, f"{spell.name}: a use effect the data can't resolve"))
    return entries


def _equip_entries(item: Item, spell: Spell, parts: list[object]) -> list[Entry]:
    entries: list[Entry] = []
    seconds_per_hit, assumed = _hit_seconds(item)
    for part in parts:
        if isinstance(part, Buff):
            if part.stat in item.stat_keys:
                continue  # GetItemStats already gives it
            if part.stat in PERCENT_KEYS and part.amount > 100:
                entries.append(Entry(UNRESOLVED, 0, f"{spell.name}: a {_num(part.amount)}% bonus the data can't resolve"))
                continue
            entries.append(Entry(part.stat, _round(part.amount), f"equip: {_amount_text(part.stat, part.amount)}"))
        elif isinstance(part, PerSecond) and part.duration_ms == 0:
            if part.kind == "heal":
                entries.append(Entry("healing", _round(part.amount), f"equip: heals {_num(part.amount)} per second → +{_num(part.amount)} healing (HPS)"))
            elif part.kind == "mp5":
                entries.append(Entry("mp5", _round(part.amount), f"equip: +{_num(part.amount)} mp5"))
            elif part.kind == "hit_damage":
                dps = part.amount / seconds_per_hit
                entries.append(Entry("dps", _round(dps), f"equip: +{_num(part.amount)} damage per hit{assumed} → +{_num(dps)} DPS"))
            else:
                dps = part.amount / ASSUMED_SECONDS_PER_HIT
                entries.append(Entry("dps", _round(dps), f"equip: {_num(part.amount)} damage to each attacker, assuming you're hit every {_num(ASSUMED_SECONDS_PER_HIT)}s → +{_num(dps)} DPS"))
        elif isinstance(part, Proc):
            rate = proc_rate(item, part.chance, part.ppm, part.icd_ms, part.classic_ppm, part.classic_chance)
            if rate is None:
                entries.append(Entry(UNRESOLVED, 0, f"{part.spell}: the data gives no proc rate"))
                continue
            entries += _proc_entries(item, part.parts, rate, "proc")
        elif isinstance(part, NoValue):
            continue
        elif isinstance(part, Unresolved):
            entries.append(Entry(UNRESOLVED, 0, part.reason))
        else:
            entries.append(Entry(UNRESOLVED, 0, f"{spell.name}: an equip effect the data can't resolve"))
    return entries


def effect_entries(item: Item, effect: ItemSpell, book: Mapping[int, Spell]) -> list[Entry]:
    """The entries for one of an item's effects. Never empty unless GetItemStats already covers it all."""
    spell = book.get(effect.spell_id)
    if spell is None:
        return [Entry(UNRESOLVED, 0, f"spell {effect.spell_id} isn't in the client data")]
    parts = spell_parts(effect.spell_id, book)
    if effect.trigger in USE_TRIGGERS:
        entries = _use_entries(item, effect, spell, parts)
    elif effect.trigger == TRIGGER_ON_EQUIP:
        entries = _equip_entries(item, spell, parts)
    elif effect.trigger == TRIGGER_CHANCE_ON_HIT:
        rate = proc_rate(item, spell.proc_chance, spell.ppm, spell.proc_icd_ms, effect.classic_ppm)
        if rate is None:
            entries = [Entry(UNRESOLVED, 0, f"{spell.name}: the data gives no proc rate")]
        else:
            entries = _proc_entries(item, parts, rate, "proc")
    else:
        entries = [Entry(UNRESOLVED, 0, f"{spell.name}: an item effect MGA Loot doesn't know")]
    if not entries and parts and all(isinstance(p, NoValue) for p in parts):
        return [Entry(NONE, 0, f"{spell.name}: no combat value")]
    if not entries and not parts:
        return [Entry(NONE, 0, f"{spell.name}: no combat value")]
    return entries


def item_entries(item: Item, effects: list[ItemSpell], book: Mapping[int, Spell]) -> list[Entry]:
    """Every entry for an item's effects, in effect order. An unresolved line is listed once,
    however many of the item's spells give it."""
    entries: list[Entry] = []
    for effect in effects:
        for entry in effect_entries(item, effect, book):
            if entry.stat == UNRESOLVED and entry in entries:
                continue
            entries.append(entry)
    return entries
