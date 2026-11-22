"""What an item's change to class spells is worth, and for which class.

A class-spell modifier (``ClassMod``) counts only for the class that owns the spells it changes
(``Entry.cls``; the addon skips it for anyone else). It is valued only where the client data gives what it needs:
the changed spell's base amount (its top rank by level 60), its cast time and its cooldown.

* **Damage / healing** (``SpellModOp`` 0 damage, 22 periodic damage, 8 all effects): the extra amount one cast deals
  or heals, ``flat`` or ``base × pct``, over ``max(cooldown, cast time)`` → ``spell_dps`` (``dps`` for a Physical
  spell) or ``healing`` (HPS). A periodic part gains the flat amount on every tick.
* **Mana cost** (14): the mana one cast saves over the same time → ``mp5``.
* **Cooldown** (11): what one cast deals or heals × (casts per second at the new cooldown − at the old one).

A change to several spells counts at the one it adds most to: they share your casting time.

A spell with no cooldown is cast as often as you choose, which the data can't say; a spell whose damage is your
weapon's, or that deals and heals nothing, has no base amount. Those, and every other kind of change (duration,
range, threat, crit chance, ...), are unresolved for their class and estimated from item level.
"""
from __future__ import annotations

from dataclasses import replace

from scripts.wow_loot.class_spell import FAMILY_CLASS, ClassSpell, changed_spells
from scripts.wow_loot.effect_model import PHYSICAL, UNRESOLVED, ClassMod, Entry

OP_DAMAGE = 0
OP_ALL_EFFECTS = 8
OP_COOLDOWN = 11
OP_COST = 14
OP_DOT = 22
DAMAGE_OPS = frozenset({OP_DAMAGE, OP_ALL_EFFECTS, OP_DOT})
# SpellModOp names for the notes.
OP_NAMES = {
    1: "duration", 2: "threat", 3: "first effect", 4: "charges", 5: "range", 6: "radius", 7: "critical strike chance",
    9: "pushback", 10: "cast time", 12: "second effect", 15: "critical strike damage", 16: "chance to be resisted",
    17: "targets hit", 18: "chance to work", 21: "global cooldown", 23: "third effect",
}


def _num(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


def _seconds(ms: float) -> str:
    return f"{_num(ms / 1000)}s"


def _interval_ms(spell: ClassSpell) -> int:
    return max(spell.cooldown_ms, spell.cast_ms)


def _extra_per_cast(mod: ClassMod, spell: ClassSpell) -> float:
    direct = spell.direct if mod.op != OP_DOT else 0.0
    periodic = spell.tick * spell.ticks if mod.op != OP_DAMAGE or not spell.direct else 0.0
    if mod.pct:
        return (direct + periodic) * mod.amount / 100
    return (mod.amount if direct else 0.0) + (mod.amount * spell.ticks if periodic else 0.0)


def _output_key(spell: ClassSpell) -> tuple[str, str, str]:
    if spell.heals:
        return "healing", "healing", "HPS"
    if spell.school_mask == PHYSICAL:
        return "dps", "damage", "DPS"
    return "spell_dps", "damage", "spell DPS"


def _why_not(mod: ClassMod, spell: ClassSpell) -> str | None:
    if spell.weapon:
        return f"{spell.name}'s damage is your weapon's"
    if mod.op == OP_COST:
        if spell.mana_cost <= 0:
            if spell.mana_pct > 0:
                return f"{spell.name} costs a share of your base mana, which the data doesn't give"
            return f"{spell.name} costs no mana"
        return None if spell.cooldown_ms > 0 else f"{spell.name} has no cooldown, so how often you cast it is up to you"
    if spell.per_cast <= 0:
        return f"{spell.name} deals and heals nothing itself"
    if spell.cooldown_ms <= 0:
        return f"{spell.name} has no cooldown, so how often you cast it is up to you"
    return None


def _spell_entry(mod: ClassMod, spell: ClassSpell, cls: str) -> Entry | None:
    interval = _interval_ms(spell)
    every = f"every {_seconds(interval)}"
    if mod.op == OP_COST:
        saved = -mod.amount * (spell.mana_cost / 100 if mod.pct else 1)
        if saved <= 0:
            return None
        mp5 = saved * 5000 / interval
        return Entry("mp5", round(mp5, 3), (
            f"{mod.name}: {_num(saved)} less mana for {spell.name} (top rank, {every}) → +{_num(mp5)} mp5"
        ), cls=cls)
    key, what, unit = _output_key(spell)
    if mod.op == OP_COOLDOWN:
        new_cd = spell.cooldown_ms * (1 + mod.amount / 100) if mod.pct else spell.cooldown_ms + mod.amount
        new_interval = max(new_cd, spell.cast_ms)
        if new_interval <= 0 or new_interval >= interval:
            return None
        gain = spell.per_cast * 1000 * (1 / new_interval - 1 / interval)
        return Entry(key, round(gain, 3), (
            f"{mod.name}: {spell.name} (top rank, {_num(spell.per_cast)} {what}) every {_seconds(new_interval)} "
            f"instead of {_seconds(interval)} → +{_num(gain)} {unit}"
        ), cls=cls)
    extra = _extra_per_cast(mod, spell)
    if extra <= 0:
        return None
    per_second = extra * 1000 / interval
    return Entry(key, round(per_second, 3), (
        f"{mod.name}: +{_num(extra)} {what} on {spell.name} (top rank, {every}) → +{_num(per_second)} {unit}"
    ), cls=cls)


def class_mod_entries(mod: ClassMod, spells: tuple[ClassSpell, ...]) -> list[Entry]:
    cls = FAMILY_CLASS.get(mod.family)
    if not cls:
        return [Entry(UNRESOLVED, 0, f"{mod.name}: changes class spells the client data doesn't name")]
    changed = [s for s in changed_spells(spells, mod.family, mod.mask) if s.cls == cls]
    if not changed:
        return [Entry(UNRESOLVED, 0, f"{mod.name}: changes a {cls} spell the client data doesn't list", cls=cls)]
    names = ", ".join(sorted({s.name for s in changed}))
    if mod.op not in DAMAGE_OPS | {OP_COST, OP_COOLDOWN}:
        what = OP_NAMES.get(mod.op, f"spell modifier {mod.op}")
        return [Entry(UNRESOLVED, 0, f"{mod.name}: changes the {what} of {names}, which has no stat equivalent", cls=cls)]
    entries: list[Entry] = []
    reasons: list[str] = []
    for spell in changed:
        reason = _why_not(mod, spell)
        entry = None if reason else _spell_entry(mod, spell, cls)
        if entry:
            entries.append(entry)
        elif reason:
            reasons.append(reason)
    if entries:
        # Spells it changes share your casting time (the shocks share one cooldown, racial spells exclude each
        # other), so it counts at the one it adds most to, never the sum.
        best = max(entries, key=lambda e: e.value)
        if len(entries) == 1:
            return [best]
        return [replace(best, note=f"{best.note} (the most of the {len(entries)} spells it changes)")]
    detail = "; ".join(sorted(set(reasons))) or f"it doesn't change what {names} deal or heal"
    return [Entry(UNRESOLVED, 0, f"{mod.name}: {detail}", cls=cls)]
