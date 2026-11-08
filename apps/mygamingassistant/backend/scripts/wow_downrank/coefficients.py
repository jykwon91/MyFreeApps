"""Classic's spell-power rules (pure): the coefficient a rank gets from its cast time, and the two penalties.

* **Coefficient** — a direct spell gets cast time / 3.5 sec of your bonus
  (cast time held between 1.5 and 3.5 sec, so instants count as 1.5); a heal
  or damage over time gets duration / 15 sec. A spell that does both splits
  its share by how much of it is over time (the "portion over time" both
  sides of the split use). An area spell gets half; each extra effect (a
  slow, a stun) costs 5%.
* **Below level 20** — a rank learned before level 20 gets
  1 − (20 − level learned) × 3.75% of its coefficient.
* **Downranking** — once your level passes the rank's max level + 5, it gets
  (max level + 5) / your level. The generator writes the "+ 5" level
  (``full_bonus_until``); the page divides by the character's level.

The coefficients the page uses are the Forever client's own
(``SpellEffect.EffectBonusCoefficient``); this formula only fills a rank that
has none, and is what the page explains.
"""
from __future__ import annotations

from dataclasses import dataclass

MIN_CAST_MS = 1500
MAX_CAST_MS = 3500
BASE_CAST_MS = 3500
DOT_BASE_MS = 15000
AREA_SHARE = 0.5
EXTRA_EFFECT_SHARE = 0.95
LOW_LEVEL_CUTOFF = 20
LOW_LEVEL_STEP = 0.0375
DOWNRANK_GRACE_LEVELS = 5


@dataclass(frozen=True)
class Coefficients:
    """A rank's share of your bonus: on the direct part, and on the over-time part in total (not per tick)."""

    direct: float
    over_time: float


def classic_coefficients(
    cast_ms: int,
    duration_ms: int,
    *,
    direct: bool,
    over_time: bool,
    area: bool = False,
    extra_effects: int = 0,
) -> Coefficients:
    """The Classic formula's coefficients for a spell with these parts."""
    cast_share = min(max(cast_ms, MIN_CAST_MS), MAX_CAST_MS) / BASE_CAST_MS
    dot_share = duration_ms / DOT_BASE_MS if over_time and duration_ms > 0 else 0.0
    if direct and dot_share:
        portion_over_time = dot_share / (dot_share + cast_share)
        result = Coefficients(cast_share * (1 - portion_over_time), dot_share * portion_over_time)
    elif direct:
        result = Coefficients(cast_share, 0.0)
    else:
        result = Coefficients(0.0, dot_share)
    factor = (AREA_SHARE if area else 1.0) * EXTRA_EFFECT_SHARE**extra_effects
    return Coefficients(result.direct * factor, result.over_time * factor)


def low_level_factor(level_learned: int) -> float:
    """The below-level-20 penalty: 1 at 20 and above, 0.2875 for a rank learned at 1."""
    if level_learned <= 0 or level_learned >= LOW_LEVEL_CUTOFF:
        return 1.0
    return 1 - (LOW_LEVEL_CUTOFF - level_learned) * LOW_LEVEL_STEP


def full_bonus_until(max_level: int | None) -> int | None:
    """The last character level that gets the rank's full bonus; None = no downranking penalty."""
    if not max_level:
        return None
    return max_level + DOWNRANK_GRACE_LEVELS
