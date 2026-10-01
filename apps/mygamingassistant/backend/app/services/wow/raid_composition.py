"""Expected raid composition by size — what the signup nudge's "Still need" uses.

Pure, no DB.  WoW Forever hasn't published per-raid compositions, so the
bands below follow the Classic-era rule of thumb (roughly one tank per ten
players and one healer per four) rounded to what raid leaders actually
bring.  Organisers can pick any size from 1 to 40, so composition is keyed
by size band rather than by raid; the band covering the event's
``size_cap`` applies.  Change the numbers here — nothing else hard-codes
them.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.services.wow.raid_roster import RoleCounts


@dataclass(frozen=True)
class Composition:
    tanks: int
    healers: int
    dps: int


@dataclass(frozen=True)
class _Band:
    max_size: int
    tanks: int
    healers: int


# Ordered by ``max_size``; the first band with ``max_size >= size`` wins.
COMPOSITION_BANDS: Final[tuple[_Band, ...]] = (
    _Band(max_size=5, tanks=1, healers=1),
    _Band(max_size=10, tanks=2, healers=3),
    _Band(max_size=15, tanks=2, healers=4),
    _Band(max_size=20, tanks=3, healers=5),
    _Band(max_size=25, tanks=3, healers=6),
    _Band(max_size=30, tanks=4, healers=8),
    _Band(max_size=40, tanks=4, healers=10),
)


@dataclass(frozen=True)
class RoleGaps:
    """Seats still wanted per role (never negative)."""

    tanks: int
    healers: int
    dps: int

    @property
    def any_scarce(self) -> bool:
        """True when tanks or healers are short — the roles worth calling out."""
        return self.tanks > 0 or self.healers > 0


def expected_composition(size: int) -> Composition:
    """Tanks / healers / DPS a raid of ``size`` players should bring."""
    band = next((b for b in COMPOSITION_BANDS if size <= b.max_size), COMPOSITION_BANDS[-1])
    tanks = min(band.tanks, size)
    healers = min(band.healers, max(size - tanks, 0))
    return Composition(tanks=tanks, healers=healers, dps=max(size - tanks - healers, 0))


def role_gaps(size: int, seated: RoleCounts) -> RoleGaps:
    """Roles still missing from the seat holders (signups without a role don't count)."""
    expected = expected_composition(size)
    return RoleGaps(
        tanks=max(expected.tanks - seated.tank, 0),
        healers=max(expected.healers - seated.healer, 0),
        dps=max(expected.dps - seated.dps, 0),
    )
