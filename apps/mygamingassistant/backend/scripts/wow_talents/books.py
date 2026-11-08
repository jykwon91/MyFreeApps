"""The two spell books a talent's rank text is read from.

* **Forever** — the Forever client's spell tables with every hotfix layer on
  top (``forever_items.load_forever_tables``): wording and numbers are what
  the game shows.
* **Classic** — the Classic Era client's wording (``Spell.Description_lang``,
  wago.tools) with cmangos classic-db's 1.12 numbers (``spell_template``). The
  Era client keeps Classic's tooltips but zeroes most base points, and cmangos
  has the numbers but no tooltips, so each side gives what it has.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping

from scripts.wow_food.tooltip import AuraOptions, Effect, SpellBook
from scripts.wow_world_map.sql_dump import SqlValue

Row = Mapping[str, str]
SqlRow = Mapping[str, SqlValue]

CLASSIC_EFFECTS = 3


def _int(value: SqlValue) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _float(value: SqlValue) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _base(rows: Iterable[Row]) -> list[Row]:
    """Rows of the normal mode only — other difficulties tune a spell for raids."""
    return [r for r in rows if _int(r.get("DifficultyID")) == 0]


def forever_book(tables: Mapping[str, Iterable[Row]]) -> SpellBook:
    """A spell book from the Forever tables (``Spell``, ``SpellName``, ``SpellEffect``, ``SpellMisc``, ...)."""
    book = SpellBook()
    for r in tables["SpellName"]:
        book.names[_int(r["ID"])] = r["Name_lang"]
    for r in tables["Spell"]:
        book.descriptions[_int(r["ID"])] = r["Description_lang"]
        book.aura_descriptions[_int(r["ID"])] = r.get("AuraDescription_lang", "")
    durations = {_int(r["ID"]): _int(r["Duration"]) for r in tables["SpellDuration"]}
    radii = {_int(r["ID"]): _float(r["Radius"]) for r in tables["SpellRadius"]}
    for r in _base(tables["SpellMisc"]):
        if ms := durations.get(_int(r["DurationIndex"])):
            book.durations_ms.setdefault(_int(r["SpellID"]), ms)
    for r in _base(tables["SpellAuraOptions"]):
        book.aura_options.setdefault(
            _int(r["SpellID"]),
            AuraOptions(_int(r["ProcChance"]), _int(r["ProcCharges"]), _int(r["CumulativeAura"])),
        )
    effects: dict[int, list[Effect]] = defaultdict(list)
    for r in _base(tables["SpellEffect"]):
        effects[_int(r["SpellID"])].append(
            Effect(
                index=_int(r["EffectIndex"]),
                effect=_int(r["Effect"]),
                aura=_int(r["EffectAura"]),
                base_points=_float(r["EffectBasePointsF"]),
                misc=_int(r["EffectMiscValue_0"]),
                period_ms=_int(r["EffectAuraPeriod"]),
                trigger=_int(r["EffectTriggerSpell"]),
                variance=_float(r.get("Variance")),
                radius_yards=radii.get(_int(r.get("EffectRadiusIndex_0")), 0.0),
                chain_targets=_int(r.get("EffectChainTargets")),
            )
        )
    book.effects = {spell: sorted(rows, key=lambda e: e.index) for spell, rows in effects.items()}
    return book


def forever_icons(misc: Iterable[Row]) -> dict[int, int]:
    """Spell id -> its icon's file data id (``SpellMisc.SpellIconFileDataID``)."""
    icons: dict[int, int] = {}
    for r in _base(misc):
        if fdid := _int(r["SpellIconFileDataID"]):
            icons.setdefault(_int(r["SpellID"]), fdid)
    return icons


def classic_effect(row: SqlRow, number: int, radii: Mapping[int, float]) -> Effect | None:
    """Effect ``number`` (1-3) of a cmangos ``spell_template`` row; None when the slot is empty.

    Classic rolls ``BasePoints + 1d DieSides`` (``BaseDice`` = 1): the low end
    is ``BasePoints + BaseDice``, the high end ``BasePoints + DieSides``. The
    Forever form is a base and a spread (``Variance``), so the roll is turned
    into that: the middle, and how far either end is from it.
    """
    if not _int(row.get(f"Effect{number}")):
        return None
    base = _int(row.get(f"EffectBasePoints{number}"))
    dice = _int(row.get(f"EffectBaseDice{number}"))
    sides = _int(row.get(f"EffectDieSides{number}"))
    low, high = base + dice, base + max(sides, dice)
    middle = (low + high) / 2
    variance = (high - low) / abs(middle) if high != low and middle else 0.0
    return Effect(
        index=number - 1,
        effect=_int(row.get(f"Effect{number}")),
        aura=_int(row.get(f"EffectApplyAuraName{number}")),
        base_points=middle,
        misc=_int(row.get(f"EffectMiscValue{number}")),
        period_ms=_int(row.get(f"EffectAmplitude{number}")),
        trigger=_int(row.get(f"EffectTriggerSpell{number}")),
        variance=variance,
        radius_yards=radii.get(_int(row.get(f"EffectRadiusIndex{number}")), 0.0),
        chain_targets=_int(row.get(f"EffectChainTarget{number}")),
    )


def classic_book(
    era_spells: Iterable[Row],
    era_names: Iterable[Row],
    era_durations: Iterable[Row],
    era_radii: Iterable[Row],
    spell_template: Iterable[SqlRow],
) -> SpellBook:
    """A spell book of the Classic Era client's wording and cmangos' numbers."""
    book = SpellBook()
    for r in era_names:
        book.names[_int(r["ID"])] = r["Name_lang"]
    for r in era_spells:
        book.descriptions[_int(r["ID"])] = r["Description_lang"]
        book.aura_descriptions[_int(r["ID"])] = r.get("AuraDescription_lang", "")
    durations = {_int(r["ID"]): _int(r["Duration"]) for r in era_durations}
    radii = {_int(r["ID"]): _float(r["Radius"]) for r in era_radii}
    for row in spell_template:
        spell = _int(row["Id"])
        if ms := durations.get(_int(row.get("DurationIndex"))):
            book.durations_ms[spell] = ms
        chance, charges, stacks = _int(row.get("ProcChance")), _int(row.get("ProcCharges")), _int(row.get("StackAmount"))
        if chance or charges or stacks:
            book.aura_options[spell] = AuraOptions(chance, charges, stacks)
        effects = [e for n in range(1, CLASSIC_EFFECTS + 1) if (e := classic_effect(row, n, radii)) is not None]
        if effects:
            book.effects[spell] = effects
    return book
