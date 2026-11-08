"""Each family's ranks from the client tables (pure): level, max level, mana, cast time and the amounts.

Forever ranks come from the Forever client (hotfix layers on top, like every
generator). A rank Forever's client doesn't have in full is filled from
Classic: the Classic Era client's cast times / durations with cmangos
classic-db's 1.12 numbers (the Era client zeroes most base points — see
``wow_talents.books``), and the Classic formula's coefficient (the Era
client's coefficients have the below-20 penalty built in).

Amounts are kept as the client stores them — a base, a per-level gain and a
spread — so the page can work out the roll at the character's level:
``base + per level × (level, held between learned and max, − learned)``,
spread ``× (1 ± variance / 2)``.
"""
from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from scripts.wow_downrank.coefficients import classic_coefficients, full_bonus_until, low_level_factor
from scripts.wow_downrank.families import KIND_HEAL, Family
from scripts.wow_talents.books import classic_effect
from scripts.wow_world_map.sql_dump import SqlValue

Row = Mapping[str, str]
SqlRow = Mapping[str, SqlValue]

EFFECT_SCHOOL_DAMAGE = 2
EFFECT_HEAL = 10
EFFECT_APPLY_AURA = 6
AURA_PERIODIC_DAMAGE = 3
AURA_PERIODIC_HEAL = 8
# Auras the Classic formula charges 5% each for (a slow, a stun, a root, a dummy).
EXTRA_EFFECT_AURAS = {4, 5, 12, 26, 33}
# Single-target implicit targets (caster, enemy, friend, any, and the chain-heal ally — single unless the
# effect chains: Forever's Healing Wave uses it with no jumps); anything else hits a group.
SINGLE_TARGETS = {1, 6, 21, 25, 45}
POWER_MANA = 0
# SkillLineAbility.AcquireMethod of a copy the game grants outside the trainer (Season of Discovery runes).
ACQUIRE_OTHER_WAY = 3
CLASSIC_EFFECTS = 3
_RANK = re.compile(r"^Rank (\d+)$")

FROM_CLIENT = "client"
FROM_CLASSIC = "classic"
COEFFICIENT_FROM_FORMULA = "formula"
MAX_LEVEL_FROM_NEXT_RANK = "nextRank"
TARGETS_SINGLE = "single"
TARGETS_CHAIN = "chain"
TARGETS_GROUP = "group"


@dataclass(frozen=True)
class Direct:
    base: float
    per_level: float
    variance: float
    coefficient: float


@dataclass(frozen=True)
class Periodic:
    tick: float
    per_level: float
    ticks: int
    period_ms: int
    # Per tick, so the over-time bonus is coefficient × ticks.
    coefficient: float


@dataclass(frozen=True)
class Rank:
    spell: int
    rank: int
    level: int
    max_level: int
    mana: int
    cast_ms: int
    direct: Direct | None
    periodic: Periodic | None
    source: str
    coefficient_from: str
    targets: str = TARGETS_SINGLE


@dataclass
class RankGaps:
    """What the client couldn't give, for the run's report."""

    from_classic: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)


def _int(value: SqlValue | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _float(value: SqlValue | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def rank_number(subtext: str) -> int | None:
    """``Rank 3`` -> 3; anything else (a rankless copy, a rune) -> None."""
    found = _RANK.match((subtext or "").strip())
    return int(found.group(1)) if found else None


def _base(rows: Iterable[Row]) -> list[Row]:
    return [r for r in rows if _int(r.get("DifficultyID")) == 0]


@dataclass(frozen=True)
class ClientSpells:
    """The Forever tables a rank needs, keyed by spell id."""

    names: Mapping[int, str]
    subtexts: Mapping[int, str]
    levels: Mapping[int, tuple[int, int]]
    mana: Mapping[int, int]
    cast_ms: Mapping[int, int]
    duration_ms: Mapping[int, int]
    effects: Mapping[int, list[Row]]
    icons: Mapping[int, int]

    @classmethod
    def from_tables(cls, tables: Mapping[str, Iterable[Row]]) -> "ClientSpells":
        cast_times = {_int(r["ID"]): _int(r["Base"]) for r in tables["SpellCastTimes"]}
        durations = {_int(r["ID"]): _int(r["Duration"]) for r in tables["SpellDuration"]}
        misc = {_int(r["SpellID"]): r for r in _base(tables["SpellMisc"])}
        effects: dict[int, list[Row]] = defaultdict(list)
        for r in _base(tables["SpellEffect"]):
            effects[_int(r["SpellID"])].append(r)
        return cls(
            names={_int(r["ID"]): r["Name_lang"] for r in tables["SpellName"]},
            subtexts={_int(r["ID"]): r.get("NameSubtext_lang", "") for r in tables["Spell"]},
            levels={
                _int(r["SpellID"]): (_int(r["SpellLevel"]), _int(r["MaxLevel"])) for r in _base(tables["SpellLevels"])
            },
            mana={
                _int(r["SpellID"]): _int(r["ManaCost"])
                for r in tables["SpellPower"]
                if _int(r["PowerType"]) == POWER_MANA and _int(r.get("OrderIndex")) == 0
            },
            cast_ms={s: cast_times.get(_int(r["CastingTimeIndex"]), 0) for s, r in misc.items()},
            duration_ms={s: durations.get(_int(r["DurationIndex"]), 0) for s, r in misc.items()},
            effects={s: sorted(rows, key=lambda r: _int(r["EffectIndex"])) for s, rows in effects.items()},
            icons={s: _int(r["SpellIconFileDataID"]) for s, r in misc.items() if _int(r["SpellIconFileDataID"])},
        )


def family_spells(
    family: Family,
    abilities: Iterable[Row],
    lines: Iterable[int],
    names: Mapping[int, str],
    subtexts: Mapping[int, str],
) -> dict[int, list[int]]:
    """Rank number -> the spells the class's skill lines teach under the family's name with that rank.

    A rank the line also teaches some other way (``AcquireMethod`` 3 — the
    copies Season of Discovery runes grant) keeps only its usual spell; the
    other copy counts only when it's the only one.
    """
    line_set = set(lines)
    usual: dict[int, set[int]] = defaultdict(set)
    other: dict[int, set[int]] = defaultdict(set)
    for row in abilities:
        spell = _int(row["Spell"])
        if _int(row["SkillLine"]) not in line_set or names.get(spell) != family.name:
            continue
        number = rank_number(subtexts.get(spell, ""))
        if number is not None:
            (other if _int(row.get("AcquireMethod")) == ACQUIRE_OTHER_WAY else usual)[number].add(spell)
    return {n: sorted(usual.get(n) or other[n]) for n in sorted(usual.keys() | other.keys())}


def _is_direct(effect: int, kind: str) -> bool:
    return effect == (EFFECT_HEAL if kind == KIND_HEAL else EFFECT_SCHOOL_DAMAGE)


def _is_periodic(effect: int, aura: int, kind: str) -> bool:
    wanted = AURA_PERIODIC_HEAL if kind == KIND_HEAL else AURA_PERIODIC_DAMAGE
    return effect == EFFECT_APPLY_AURA and aura == wanted


def _targets(implicit: int, chain_targets: int) -> str:
    if chain_targets > 1:
        return TARGETS_CHAIN
    return TARGETS_SINGLE if implicit in SINGLE_TARGETS else TARGETS_GROUP


def client_rank(spells: ClientSpells, spell: int, number: int, kind: str) -> Rank | None:
    """A Forever rank, or None when the client lacks its level, mana or an amount."""
    level, max_level = spells.levels.get(spell, (0, 0))
    mana = spells.mana.get(spell, 0)
    direct_row = next((e for e in spells.effects.get(spell, []) if _is_direct(_int(e["Effect"]), kind)), None)
    periodic_row = next(
        (e for e in spells.effects.get(spell, []) if _is_periodic(_int(e["Effect"]), _int(e["EffectAura"]), kind)),
        None,
    )
    if not level or mana <= 0 or (direct_row is None and periodic_row is None):
        return None
    cast_ms = spells.cast_ms.get(spell, 0)
    duration_ms = spells.duration_ms.get(spell, 0)
    extra = sum(
        1 for e in spells.effects.get(spell, [])
        if _int(e["Effect"]) == EFFECT_APPLY_AURA and _int(e["EffectAura"]) in EXTRA_EFFECT_AURAS
    )
    main = direct_row or periodic_row
    assert main is not None
    targets = _targets(_int(main.get("ImplicitTarget_0")), _int(main.get("EffectChainTargets")))
    formula = classic_coefficients(
        cast_ms, duration_ms, direct=direct_row is not None, over_time=periodic_row is not None,
        area=targets == TARGETS_GROUP, extra_effects=extra,
    )
    used_formula = False
    direct = None
    if direct_row is not None:
        coefficient = _float(direct_row["EffectBonusCoefficient"])
        if coefficient <= 0:
            coefficient, used_formula = formula.direct, True
        direct = Direct(
            _float(direct_row["EffectBasePointsF"]), _float(direct_row["EffectRealPointsPerLevel"]),
            _float(direct_row["Variance"]), coefficient,
        )
    periodic = None
    if periodic_row is not None:
        period = _int(periodic_row["EffectAuraPeriod"])
        ticks = duration_ms // period if period else 0
        if ticks <= 0:
            return None
        coefficient = _float(periodic_row["EffectBonusCoefficient"])
        if coefficient <= 0 and direct is None:
            coefficient, used_formula = formula.over_time / ticks, True
        periodic = Periodic(
            _float(periodic_row["EffectBasePointsF"]), _float(periodic_row["EffectRealPointsPerLevel"]),
            ticks, period, coefficient,
        )
    return Rank(
        spell, number, level, max_level, mana, cast_ms, direct, periodic, FROM_CLIENT,
        COEFFICIENT_FROM_FORMULA if used_formula else FROM_CLIENT, targets,
    )


def classic_rank(
    row: SqlRow, number: int, kind: str, cast_times: Mapping[int, int], durations: Mapping[int, int]
) -> Rank | None:
    """A rank from cmangos' ``spell_template`` row, timed by the Classic Era client's tables."""
    level, max_level, mana = _int(row.get("SpellLevel")), _int(row.get("MaxLevel")), _int(row.get("ManaCost"))
    cast_ms = cast_times.get(_int(row.get("CastingTimeIndex")), 0)
    duration_ms = durations.get(_int(row.get("DurationIndex")), 0)
    direct_n = periodic_n = None
    extra = 0
    for n in range(1, CLASSIC_EFFECTS + 1):
        effect, aura = _int(row.get(f"Effect{n}")), _int(row.get(f"EffectApplyAuraName{n}"))
        if direct_n is None and _is_direct(effect, kind):
            direct_n = n
        elif periodic_n is None and _is_periodic(effect, aura, kind):
            periodic_n = n
        elif effect == EFFECT_APPLY_AURA and aura in EXTRA_EFFECT_AURAS:
            extra += 1
    if not level or mana <= 0 or (direct_n is None and periodic_n is None):
        return None
    main = direct_n or periodic_n
    targets = _targets(_int(row.get(f"EffectImplicitTargetA{main}")), _int(row.get(f"EffectChainTarget{main}")))
    formula = classic_coefficients(
        cast_ms, duration_ms, direct=direct_n is not None, over_time=periodic_n is not None,
        area=targets == TARGETS_GROUP, extra_effects=extra,
    )
    direct = None
    if direct_n is not None:
        e = classic_effect(row, direct_n, {})
        assert e is not None
        direct = Direct(e.base_points, _float(row.get(f"EffectRealPointsPerLevel{direct_n}")), e.variance, formula.direct)
    periodic = None
    if periodic_n is not None:
        e = classic_effect(row, periodic_n, {})
        assert e is not None
        ticks = duration_ms // e.period_ms if e.period_ms else 0
        if ticks <= 0:
            return None
        periodic = Periodic(
            e.base_points, _float(row.get(f"EffectRealPointsPerLevel{periodic_n}")), ticks, e.period_ms,
            formula.over_time / ticks,
        )
    return Rank(
        _int(row["Id"]), number, level, max_level, mana, cast_ms, direct, periodic, FROM_CLASSIC,
        COEFFICIENT_FROM_FORMULA, targets,
    )


def pick_client_rank(
    spells: ClientSpells, family: Family, number: int, candidates: list[int]
) -> Rank | None:
    """The one complete rank among same-rank copies (a rankless rune copy has no mana); two complete ones stop the run."""
    complete = [r for s in candidates if (r := client_rank(spells, s, number, family.kind)) is not None]
    if len(complete) > 1:
        raise SystemExit(f"{family.id} Rank {number}: more than one complete spell {[r.spell for r in complete]}")
    return complete[0] if complete else None


def round_to(value: float, places: int = 4) -> float:
    rounded = round(value, places)
    return int(rounded) if rounded == int(rounded) else rounded


def rank_doc(rank: Rank, next_level: int | None) -> dict[str, Any]:
    """One rank as the page reads it. A rank with no max level in the files ends the level before the next rank."""
    max_level: int | None = rank.max_level or None
    max_from: str | None = rank.source if max_level else None
    if max_level is None and next_level is not None:
        max_level, max_from = next_level - 1, MAX_LEVEL_FROM_NEXT_RANK
    direct = periodic = None
    if rank.direct is not None:
        d = rank.direct
        direct = {
            "base": round_to(d.base), "perLevel": round_to(d.per_level),
            "variance": round_to(d.variance), "coefficient": round_to(d.coefficient),
        }
    if rank.periodic is not None:
        p = rank.periodic
        periodic = {
            "tick": round_to(p.tick), "perLevel": round_to(p.per_level), "ticks": p.ticks,
            "periodMs": p.period_ms, "coefficient": round_to(p.coefficient),
        }
    return {
        "spell": rank.spell,
        "rank": rank.rank,
        "level": rank.level,
        "maxLevel": max_level,
        "maxLevelFrom": max_from,
        "fullBonusUntil": full_bonus_until(max_level),
        "lowLevelFactor": round_to(low_level_factor(rank.level)),
        "mana": rank.mana,
        "castMs": rank.cast_ms,
        "direct": direct,
        "periodic": periodic,
        "from": rank.source,
        "coefficientFrom": rank.coefficient_from,
    }


def rank_docs(ranks: list[Rank]) -> list[dict[str, Any]]:
    """Every rank of a family in rank order, each knowing the next rank's level."""
    ordered = sorted(ranks, key=lambda r: r.rank)
    return [rank_doc(r, ordered[i + 1].level if i + 1 < len(ordered) else None) for i, r in enumerate(ordered)]
