"""The rows and constants MGA Loot's effect values read: client effect / aura numbers, spells, items,
what a spell does (``Damage``, ``Buff``, ``Proc``...) and the entries written. See ``effect_values``."""
from __future__ import annotations

from dataclasses import dataclass

# A non-weapon item's "chance per hit" is counted at one hit (or spell cast, or hit taken) every this many seconds.
ASSUMED_SECONDS_PER_HIT = 2.5
# A proc on your spell casts is counted at one cast every this many seconds when its rate is a chance per cast:
# Classic's main nukes take 2.5-3.5s to cast (Frostbolt and talented Shadow Bolt 2.5s, Fireball 3-3.5s), so
# 2.5s is the quick end of a caster's rotation. A capped proc (Zum'rah's cane: once a minute) doesn't depend on it.
ASSUMED_SECONDS_PER_CAST = 2.5

# SpellAuraOptions.ProcTypeMask_0 bits: what a proc aura procs on. Dealing a melee or ranged hit, or casting a spell.
PROC_ON_HIT_BITS = 0x4 | 0x10 | 0x40 | 0x100  # deal melee swing / melee ability / ranged attack / ranged ability
PROC_ON_CAST_BITS = 0x4000 | 0x10000 | 0x40000  # deal helpful spell / harmful spell / harmful periodic

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
# A proc aura whose tooltip says "chance" but whose ProcChance is 100 carries no real chance: the client
# has 100 on Forever's "Chance on harmful spell cast" auras, whose rate the server keeps. Such a proc counts
# only at its internal cooldown, the most it can proc, and only when that cooldown is at least this many
# hits or casts long (a 100ms cooldown only stops double procs, so it says nothing about the rate).
FULL_CHANCE = 100
MIN_CAP_EVENTS = 10
# A chance-on-hit item spell with neither a PPM nor a ProcChance of 100 or less procs, in the Classic server
# (cmangos Player::CastItemCombatSpell -> Unit::GetWeaponProcChance), at swing seconds x 1.8 % per main-hand
# swing: 1.8 / 100 x 60 = 1.08 procs a minute whatever the weapon's speed.
CLASSIC_SERVER_ITEM_PPM = 1.08
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
# Summon effects whose misc value is a creature (the rest summon objects or totems): summon, wild, pet, demon.
CREATURE_SUMMON_EFFECTS = frozenset({28, 41, 56, 97, 112})
# cmangos CreatureType values that never fight: critter, totem, non-combat pet, gas cloud.
NON_COMBAT_CREATURE_TYPES = frozenset({8, 11, 12, 13})
# Auras on the enemy that only control it: charm, confuse, fear, stun, root, silence, snare, pacify, disarm.
CONTROL_AURAS = frozenset({5, 6, 7, 12, 26, 27, 33, 60, 67})
# Haste auras: on the enemy with a negative amount they slow its attacks, which is control too.
HASTE_AURAS = frozenset({192, 319, 342})
# Effects that only do something outside a fight: quest complete / start, open lock, kill credit, reputation.
OUT_OF_COMBAT_EFFECTS = frozenset({16, 33, 90, 103, 134, 150})


@dataclass(frozen=True)
class Creature:
    """A summoned creature: ``dps`` is its melee damage per second from cmangos classic-db, None when
    the Classic data doesn't have it (a creature WoW Forever added)."""

    id: int
    name: str
    dps: float | None
    fights: bool = True


@dataclass(frozen=True)
class World:
    """What MGA Loot knows about the mobs you fight, from cmangos classic-db's normal spawned mobs.

    ``mob_dps`` and ``mob_armor``: the median by ten-level band of minimum level (``creature_types.band_of``).
    ``resist_free``: the spell schools no band's median mob resists at all.
    """

    mob_dps: tuple[tuple[int, float], ...] = ()
    mob_armor: tuple[tuple[int, float], ...] = ()
    resist_free: frozenset[str] = frozenset()

    def dps_at(self, band: int) -> tuple[int, float] | None:
        """The band at or below ``band`` with a median, and that median."""
        known = [(b, dps) for b, dps in self.mob_dps if b <= band]
        return known[-1] if known else None


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
    # A proc aura that procs on your spell casts, not your hits (ProcTypeMask).
    cast_proc: bool = False
    # The spell's tooltip calls it a chance ("Chance on hit...", "...have a chance to...").
    chance_worded: bool = False
    # The creatures this spell's summon effects summon, as cmangos classic-db knows them.
    creatures: tuple[Creature, ...] = ()


@dataclass(frozen=True)
class Item:
    id: int
    # Seconds per swing for a weapon (ItemSparse.ItemDelay); None for anything else.
    weapon_speed: float | None = None
    # Weight keys GetItemStats already gives for this item (its ItemSparse stat lines).
    stat_keys: frozenset[str] = frozenset()
    # The level the item needs (ItemSparse.RequiredLevel): where a summon the Classic data lacks is counted.
    level: int = 0


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
    cast: bool = False
    # ProcChance 100 on a proc its tooltip calls a chance: the chance isn't in the data.
    chance_unknown: bool = False


@dataclass(frozen=True)
class Summon:
    """A creature summoned for ``duration_ms``, fighting for you."""

    creature: Creature
    duration_ms: int


@dataclass(frozen=True)
class ArmorCut:
    """``amount`` armor off the enemy for ``duration_ms``."""

    amount: float
    duration_ms: int


@dataclass(frozen=True)
class ResistCut:
    """``amount`` of a magic school's resistance off the enemy."""

    name: str
    schools: tuple[str, ...]
    amount: float


@dataclass(frozen=True)
class Control:
    """An effect that only controls the enemy (stun, root, fear, slow...)."""

    name: str


@dataclass(frozen=True)
class NoValue:
    name: str


@dataclass(frozen=True)
class Unresolved:
    reason: str
