"""What an item's Use, Chance on hit and Equip effects are worth, in MGA Loot's stat-weight keys.

Pure functions over client spell rows; ``item_effects.py`` loads the tables and writes the JSON.
Every conversion turns an effect into a steady per-fight equivalent of a stat the weights know:

* **On use, stat buff:** ``stat × duration / max(cooldown, duration)`` — the buff's average over its cooldown.
* **On use, damage or heal:** ``amount / cooldown`` → ``use_dps`` or ``healing`` (HPS). ``use_dps`` is damage
  anyone can deal: the addon weighs it like weapon DPS or, for a caster, like spell damage (see ``spell_dps``).
  Mana restored becomes ``mp5`` (``amount × 5 / cooldown``); an absorb shield counts as healing.
* **Chance on hit, damage:** ``damage × procs per second``. Procs per second are ``PPM / 60`` when the spell
  has a procs-per-minute rate (``SpellAuraOptions.SpellProcsPerMinuteID`` → ``SpellProcsPerMinute``); otherwise
  ``ProcChance% × hits per second``, with hits per second ``1 / weapon speed`` for a weapon and, for anything
  else, one hit every ``ASSUMED_SECONDS_PER_HIT`` seconds (an assumption, stated in each note it touches).
  A chance-on-hit item spell whose client data has neither (``ProcChance`` 101 is "not set") takes the item's
  PPM from cmangos classic-db's ``item_template.spellppmRate`` — the client carries none — and the note says
  "Classic rate" (an item Forever gave a renumbered proc spell takes it when both sides have exactly one
  chance on hit). With no Classic rate either, a chance-on-hit item spell takes the Classic server's own rule
  for items with no rate, ``CLASSIC_SERVER_ITEM_PPM`` (1.08 PPM, from cmangos ``GetWeaponProcChance``), and the
  note says "Classic server rule". An Equip proc aura with no client rate likewise takes cmangos' ``spell_proc_event``
  ``ppmRate`` / ``CustomChance`` for that aura spell. With no rate anywhere the effect is unresolved: no rate is
  ever made up — ``ProcChance`` 101 ("not set") is never read as a number.
  An internal cooldown (``SpellAuraOptions.ProcCategoryRecovery``) caps the rate.
* **Chance on hit, buff:** ``stat × uptime``, ``uptime = min(1, procs per second × duration)``.
* **A chance the data doesn't give:** a proc aura whose tooltip says "chance" but whose ``ProcChance`` is 100
  (Forever's "Chance on harmful spell cast" auras: the server keeps the real rate) has no chance in the data.
  It takes a PPM or Classic rate when there is one; else, with an internal cooldown at least ``MIN_CAP_EVENTS``
  hits or casts long, it counts at that cooldown (the most it can proc), and the note says so; else unresolved.
* **Procs on your spell casts** (a proc aura whose ``ProcTypeMask`` is spell casts, not hits): a chance per cast
  counts one cast every ``ASSUMED_SECONDS_PER_CAST`` seconds, and the damage it deals is ``spell_dps``, which
  the addon weighs at the class's spell damage weight × 3.5 (Classic's spell coefficient is cast time / 3.5,
  so 1 spell damage adds 1/3.5 DPS to any direct-damage spell cast back to back). Weapon-DPS weights would
  zero it for exactly the casters who can proc it.
* **Summons:** the creature's melee DPS × uptime (a proc's ``min(1, procs per second × duration)``, a Use's
  ``duration / max(cooldown, duration)``). DPS is cmangos classic-db's ``creature_template``: average of
  ``MinMeleeDmg`` / ``MaxMeleeDmg`` plus ``MeleeAttackPower / 14 × swing seconds``, times ``DamageMultiplier``,
  over ``MeleeBaseAttackTime`` (cmangos ``Creature::UpdateDamagePhysical``). A creature WoW Forever added,
  so the Classic data lacks, counts at the median DPS of a normal mob in the ten-level band of the level the
  item needs, and the note says so. A summon that doesn't fight (critter, totem, pet) has no combat value.
* **Armor off the enemy:** ``armor_cut`` = the armor removed × uptime. The addon turns it into a share of your
  weapon DPS at your level: Classic's damage reduction is ``armor / (armor + 400 + 85 × level)``, against
  the median armor of normal mobs in your ten-level band (``mobArmor`` in the JSON).
* **Resistance off the enemy:** worth nothing against normal mobs when no band's median mob resists that
  school at all (cmangos ``creature_template``), and the note says so.
* **Control on the enemy** (stun, root, fear, silence, snare, slowed attacks): value 0, note "control effect:
  no damage or healing value".
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
* **Unresolved:** scripted (dummy) spells, other effects on the enemy, effects on your pet, class-spell
  modifiers, summoned objects and totems, rage / energy, buffs that last a set number of hits,
  and anything the data gives no rate, cooldown or duration for. The addon says it can't judge those.

A dummy effect that triggers the same spell as a real effect in the same spell (Hand of Justice's tooltip
copy of its proc) adds nothing and is skipped.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from scripts.wow_loot.creature_types import band_of
from scripts.wow_loot.effect_model import (
    ASSUMED_SECONDS_PER_CAST,
    ASSUMED_SECONDS_PER_HIT,
    CLASSIC_SERVER_ITEM_PPM,
    MIN_CAP_EVENTS,
    NO_RATE,
    NONE,
    PERCENT_KEYS,
    TRIGGER_CHANCE_ON_HIT,
    TRIGGER_ON_EQUIP,
    UNRESOLVED,
    USE_TRIGGERS,
    ArmorCut,
    Buff,
    Control,
    Damage,
    Entry,
    ExtraAttacks,
    Heal,
    Item,
    ItemSpell,
    Mana,
    NoValue,
    PerSecond,
    Proc,
    ResistCut,
    Spell,
    Summon,
    Unresolved,
    World,
)
from scripts.wow_loot.effect_parts import (
    spell_parts,
)


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


def _hit_seconds(item: Item, cast: bool = False) -> tuple[float, str]:
    if cast:
        return ASSUMED_SECONDS_PER_CAST, f", assuming a cast every {_num(ASSUMED_SECONDS_PER_CAST)}s"
    if item.weapon_speed:
        return item.weapon_speed, ""
    return ASSUMED_SECONDS_PER_HIT, f", assuming a hit every {_num(ASSUMED_SECONDS_PER_HIT)}s"


def proc_rate(
    item: Item, chance: float, ppm: float, icd_ms: int, classic_ppm: float = 0, classic_chance: float = 0,
    cast: bool = False, chance_unknown: bool = False,
) -> Rate | None:
    """Procs per second, or None when the data gives no rate. Forever's rate first, then cmangos' Classic one.

    ``chance_unknown``: the client's 100 isn't the real chance, so only a PPM, a Classic rate or a long
    internal cooldown (counted at the most it allows) gives a rate.
    """
    if chance_unknown:
        chance = 0
    if ppm > 0:
        rate = Rate(ppm / 60, f"{_num(ppm)} PPM")
    elif 0 < chance < NO_RATE:
        seconds, assumed = _hit_seconds(item, cast)
        rate = Rate(chance / 100 / seconds, f"{_num(chance)}% per {'cast' if cast else 'hit'}{assumed}")
    elif classic_ppm > 0:
        rate = Rate(classic_ppm / 60, f"{_num(classic_ppm)} PPM (Classic rate)")
    elif 0 < classic_chance <= 100:
        seconds, assumed = _hit_seconds(item, cast)
        per = "cast" if cast else "hit"
        rate = Rate(classic_chance / 100 / seconds, f"{_num(classic_chance)}% per {per} (Classic rate){assumed}")
    elif chance_unknown and icd_ms >= MIN_CAP_EVENTS * _hit_seconds(item, cast)[0] * 1000:
        what = "per cast" if cast else "per hit"
        return Rate(1000 / icd_ms, f"once every {_duration(icd_ms)} (its cooldown; the chance {what} isn't in the data, so it counts at the most it can proc)")
    else:
        return None
    if icd_ms > 0 and rate.per_second > 1000 / icd_ms:
        rate = Rate(1000 / icd_ms, f"{rate.text}, capped by its {_duration(icd_ms)} cooldown")
    return rate


def _summon_entry(item: Item, part: Summon, uptime: float, when: str, key: str, world: World) -> Entry:
    """A summoned creature's DPS × the share of the time it's out."""
    creature = part.creature
    lasting = f"for {_duration(part.duration_ms)} {when}"
    if creature.dps is not None:
        dps = creature.dps * uptime
        return Entry(key, _round(dps), f"summons {creature.name} ({_num(creature.dps)} DPS) {lasting} → +{_num(dps)} DPS")
    median = world.dps_at(band_of(item.level))
    if median is None:
        return Entry(UNRESOLVED, 0, f"{creature.name}: the data has no mob DPS to count it at")
    band, mob_dps = median
    dps = mob_dps * uptime
    return Entry(key, _round(dps), (
        f"summons {creature.name} {lasting}; it isn't in the Classic data, so it counts as a normal "
        f"level {band}-{band + 9} mob ({_num(mob_dps)} DPS, the median) → +{_num(dps)} DPS"
    ))


def _enemy_entry(part: object, uptime: float, when: str, world: World) -> Entry | None:
    """An armor or resistance cut on the enemy, or a control effect; None for any other part."""
    if isinstance(part, Control):
        return Entry(NONE, 0, f"{part.name}: control effect: no damage or healing value")
    if isinstance(part, ArmorCut):
        if part.duration_ms <= 0:
            return Entry(UNRESOLVED, 0, "an armor cut with no duration")
        average = part.amount * uptime
        return Entry("armor_cut", _round(average), (
            f"-{_num(part.amount)} armor on the target for {_duration(part.duration_ms)} {when} "
            f"→ -{_num(average)} armor on average"
        ))
    if isinstance(part, ResistCut):
        names = " and ".join(part.schools)
        if all(school in world.resist_free for school in part.schools):
            return Entry(NONE, 0, (
                f"{part.name}: -{_num(part.amount)} {names} resistance on the target; normal mobs at every level "
                f"resist none (median 0), so it adds no damage"
            ))
        return Entry(UNRESOLVED, 0, f"{part.name}: cuts {names} resistance, which normal mobs have")
    return None


def _proc_entries(
    item: Item, parts: tuple | list, rate: Rate, prefix: str, world: World = World(), cast: bool = False,
) -> list[Entry]:
    """Entries for what a proc casts, at ``rate`` procs per second."""
    entries: list[Entry] = []
    seconds_per_hit, _ = _hit_seconds(item)
    damage_key = "spell_dps" if cast else "dps"
    for part in parts:
        if isinstance(part, Summon):
            uptime = min(1.0, rate.per_second * part.duration_ms / 1000)
            entry = _summon_entry(item, part, uptime, f"at {rate.text}", damage_key, world)
            entries.append(Entry(entry.stat, entry.value, f"{prefix}: {entry.note}") if entry.stat != UNRESOLVED else entry)
            continue
        enemy = _enemy_entry(part, min(1.0, rate.per_second * getattr(part, "duration_ms", 0) / 1000), f"at {rate.text}", world)
        if enemy is not None:
            entries.append(Entry(enemy.stat, enemy.value, f"{prefix}: {enemy.note}") if enemy.stat == "armor_cut" else enemy)
            continue
        if isinstance(part, Damage):
            dps = part.amount * rate.per_second
            school = f" {part.school}" if part.school else ""
            entries.append(Entry(damage_key, _round(dps), f"{prefix}: {_num(part.amount)}{school} dmg at {rate.text} → +{_num(dps)} DPS"))
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


def _use_entries(item: Item, effect: ItemSpell, spell: Spell, parts: list[object], world: World = World()) -> list[Entry]:
    cooldown = _use_cooldown(effect, spell)
    valued = [p for p in parts if not isinstance(p, (NoValue, Unresolved, Control, ResistCut))]
    if valued and cooldown <= 0:
        return [Entry(UNRESOLVED, 0, f"{spell.name}: no cooldown in the data")]
    every = f"every {_duration(cooldown)}" if cooldown > 0 else ""
    entries: list[Entry] = []
    for part in parts:
        lasting = getattr(part, "duration_ms", 0)
        uptime = lasting / max(cooldown, lasting) if cooldown > 0 and lasting > 0 else 0.0
        if isinstance(part, Summon):
            entry = _summon_entry(item, part, uptime, every, "use_dps", world)
            entries.append(Entry(entry.stat, entry.value, f"use: {entry.note}") if entry.stat != UNRESOLVED else entry)
            continue
        enemy = _enemy_entry(part, uptime, every, world)
        if enemy is not None:
            entries.append(Entry(enemy.stat, enemy.value, f"use: {enemy.note}") if enemy.stat == "armor_cut" else enemy)
            continue
        if isinstance(part, Damage):
            dps = part.amount / (cooldown / 1000)
            school = f" {part.school}" if part.school else ""
            entries.append(Entry("use_dps", _round(dps), f"use: {_num(part.amount)}{school} dmg {every} → +{_num(dps)} DPS"))
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


def _equip_entries(item: Item, spell: Spell, parts: list[object], world: World = World()) -> list[Entry]:
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
            rate = proc_rate(
                item, part.chance, part.ppm, part.icd_ms, part.classic_ppm, part.classic_chance, part.cast,
                part.chance_unknown,
            )
            if rate is None:
                entries.append(Entry(UNRESOLVED, 0, f"{part.spell}: the data gives no proc rate"))
                continue
            entries += _proc_entries(item, part.parts, rate, "proc", world, part.cast)
        elif isinstance(part, Control):
            entries.append(Entry(NONE, 0, f"{part.name}: control effect: no damage or healing value"))
        elif isinstance(part, NoValue):
            continue
        elif isinstance(part, Unresolved):
            entries.append(Entry(UNRESOLVED, 0, part.reason))
        else:
            entries.append(Entry(UNRESOLVED, 0, f"{spell.name}: an equip effect the data can't resolve"))
    return entries


def effect_entries(item: Item, effect: ItemSpell, book: Mapping[int, Spell], world: World = World()) -> list[Entry]:
    """The entries for one of an item's effects. Never empty unless GetItemStats already covers it all."""
    spell = book.get(effect.spell_id)
    if spell is None:
        return [Entry(UNRESOLVED, 0, f"spell {effect.spell_id} isn't in the client data")]
    parts = spell_parts(effect.spell_id, book)
    if effect.trigger in USE_TRIGGERS:
        entries = _use_entries(item, effect, spell, parts, world)
    elif effect.trigger == TRIGGER_ON_EQUIP:
        entries = _equip_entries(item, spell, parts, world)
    elif effect.trigger == TRIGGER_CHANCE_ON_HIT:
        rate = proc_rate(item, spell.proc_chance, spell.ppm, spell.proc_icd_ms, effect.classic_ppm)
        if rate is None and spell.proc_chance >= NO_RATE:
            rate = Rate(CLASSIC_SERVER_ITEM_PPM / 60, f"{CLASSIC_SERVER_ITEM_PPM:g} PPM (Classic server rule)")
        if rate is None:
            entries = [Entry(UNRESOLVED, 0, f"{spell.name}: the data gives no proc rate")]
        else:
            entries = _proc_entries(item, parts, rate, "proc", world)
    else:
        entries = [Entry(UNRESOLVED, 0, f"{spell.name}: an item effect MGA Loot doesn't know")]
    if not entries and parts and all(isinstance(p, NoValue) for p in parts):
        return [Entry(NONE, 0, f"{spell.name}: no combat value")]
    if not entries and not parts:
        return [Entry(NONE, 0, f"{spell.name}: no combat value")]
    return entries


def item_entries(item: Item, effects: list[ItemSpell], book: Mapping[int, Spell], world: World = World()) -> list[Entry]:
    """Every entry for an item's effects, in effect order. An unresolved or no-value line is listed once,
    however many of the item's spells give it."""
    entries: list[Entry] = []
    for effect in effects:
        for entry in effect_entries(item, effect, book, world):
            if entry.stat in (UNRESOLVED, NONE) and entry in entries:
                continue
            entries.append(entry)
    return entries
