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
from dataclasses import dataclass

from scripts.wow_loot.effect_model import (
    ASSUMED_SECONDS_PER_HIT,
    NO_RATE,
    NONE,
    PERCENT_KEYS,
    TRIGGER_CHANCE_ON_HIT,
    TRIGGER_ON_EQUIP,
    UNRESOLVED,
    USE_TRIGGERS,
    Buff,
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
    Spell,
    Unresolved,
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
