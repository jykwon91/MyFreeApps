"""What MGA Loot counts summons and enemy debuffs against: creature damage and the mobs you fight.

All from cmangos classic-db's ``creature_template`` (and ``creature`` for which mobs are spawned):

* A creature's melee DPS, as cmangos ``Creature::UpdateDamagePhysical`` works it out: the average of
  ``MinMeleeDmg`` and ``MaxMeleeDmg`` plus ``MeleeAttackPower / 14 × swing seconds``, times
  ``DamageMultiplier``, over ``MeleeBaseAttackTime``.
* The mobs you fight: spawned normal mobs (``Rank`` 0, no NPC role, a combat creature type), in the same
  ten-level bands as ``creature_types``. Each band keeps the median DPS, the median armor, and whether its
  median mob resists each magic school at all.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from statistics import median

from scripts.wow_loot.creature_types import CREATURE_TYPES, band_of
from scripts.wow_loot.effect_model import NON_COMBAT_CREATURE_TYPES, Creature, World

NORMAL_RANK = 0
AP_PER_DPS = 14  # attack power per point of DPS, for players and creatures alike
RESISTANCE_COLUMNS = {
    "Holy": "ResistanceHoly", "Fire": "ResistanceFire", "Nature": "ResistanceNature",
    "Frost": "ResistanceFrost", "Shadow": "ResistanceShadow", "Arcane": "ResistanceArcane",
}


def _f(row: Mapping[str, object], key: str, default: float = 0.0) -> float:
    value = row.get(key)
    return float(value) if value not in (None, "") else default  # type: ignore[arg-type]


def creature_dps(template: Mapping[str, object]) -> float:
    """Melee damage per second of a cmangos ``creature_template`` row."""
    speed = _f(template, "MeleeBaseAttackTime", 2000) / 1000 or 2.0
    swing = (_f(template, "MinMeleeDmg") + _f(template, "MaxMeleeDmg")) / 2
    swing += _f(template, "MeleeAttackPower") / AP_PER_DPS * speed
    return round(swing * _f(template, "DamageMultiplier", 1) / speed, 1)


def _fights(creature_type: int) -> bool:
    return creature_type not in NON_COMBAT_CREATURE_TYPES


def summoned_creature(
    creature_id: int,
    templates: Mapping[int, Mapping[str, object]],
    by_name: Mapping[str, Mapping[str, object]],
    client_names: Mapping[int, tuple[str, int]],
) -> Creature:
    """The creature a summon makes: its Classic template by id, else by the client's name for it (Forever
    renumbers some), else just the client's name and type with no DPS."""
    template = templates.get(creature_id)
    name, client_type = client_names.get(creature_id, ("", 0))
    if template is None and name:
        template = by_name.get(name)
    if template is not None:
        return Creature(
            creature_id, str(template["Name"]), creature_dps(template), _fights(int(_f(template, "CreatureType"))),
        )
    return Creature(creature_id, name or f"creature {creature_id}", None, _fights(client_type))


def unique_names(templates: Iterable[Mapping[str, object]]) -> dict[str, Mapping[str, object]]:
    """Name -> template, for names only one creature has (a shared name can't say which it is)."""
    seen: dict[str, list[Mapping[str, object]]] = {}
    for t in templates:
        seen.setdefault(str(t["Name"]), []).append(t)
    return {name: rows[0] for name, rows in seen.items() if len(rows) == 1}


def normal_mobs(creatures: Iterable[Mapping[str, object]], templates: Mapping[int, Mapping[str, object]]) -> list[Mapping[str, object]]:
    """The templates of spawned normal mobs: no NPC role, a combat creature type, rank 0."""
    spawned = {int(c["id"]) for c in creatures}  # type: ignore[arg-type]
    return [
        t for entry, t in templates.items()
        if entry in spawned and not int(_f(t, "NpcFlags")) and int(_f(t, "Rank")) == NORMAL_RANK
        and int(_f(t, "CreatureType")) in CREATURE_TYPES
    ]


def mob_world(mobs: Iterable[Mapping[str, object]]) -> World:
    """Median DPS and armor per ten-level band, and the schools no band's median mob resists."""
    bands: dict[int, list[Mapping[str, object]]] = {}
    for t in mobs:
        bands.setdefault(band_of(int(_f(t, "MinLevel"))), []).append(t)
    ordered = sorted(bands.items())
    resist_free = frozenset(
        school for school, column in RESISTANCE_COLUMNS.items()
        if all(median(_f(t, column) for t in rows) == 0 for _, rows in ordered)
    )
    return World(
        mob_dps=tuple((band, round(median(creature_dps(t) for t in rows), 1)) for band, rows in ordered),
        mob_armor=tuple((band, median(_f(t, "Armor") for t in rows)) for band, rows in ordered),
        resist_free=resist_free,
    )
