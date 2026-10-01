"""Raid roster summary + seat rules — pure, stateless, no DB access.

Computes the roster state from a list of WowRaidSignup rows and a size_cap.
Used by the signup embed, the signup service (who gets a seat, who gets
benched, who gets promoted) and the /raid list counts.

Seat rules
----------
* **Seat-holding statuses** are ``confirmed`` and ``late`` — both players are
  coming.  ``tentative`` does NOT hold a seat: a "maybe" must never push a
  sure player onto the bench.
* The raid is full when seat holders ≥ ``size_cap``.  A request for a seat
  when full lands on the bench.
* Bench ordering is FIFO by ``signed_up_at`` ASC — the signup service resets
  ``signed_up_at`` when a player *joins* the bench, so the timestamp means
  "joined the queue".
* Declined signups are tracked separately and never count toward the cap.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Final

from app.models.wow.wow_raid_signup import RAID_ROLES, WowRaidSignup

SEAT_STATUSES: Final = ("confirmed", "late")
BENCH_STATUS: Final = "bench"
DECLINED_STATUS: Final = "declined"
TENTATIVE_STATUS: Final = "tentative"


@dataclass(frozen=True)
class RoleCounts:
    """Seat-holder counts for one role."""

    tank: int = 0
    healer: int = 0
    dps: int = 0
    unknown: int = 0  # signed up but role not yet selected

    @property
    def total(self) -> int:
        return self.tank + self.healer + self.dps + self.unknown


@dataclass
class RosterSummary:
    """Structured summary of a raid's signup state.

    Attributes
    ----------
    size_cap:
        The event's hard cap (1–40).
    seats_taken:
        Signups holding a seat — status ``confirmed`` or ``late``.
    confirmed_count / late_count / tentative_count:
        Per-status counts (``confirmed_count + late_count == seats_taken``).
    bench_count / declined_count:
        Per-status counts.
    role_counts:
        Breakdown of seat holders by role.
    is_full:
        True when seats_taken >= size_cap.
    bench_overflow:
        Bench signups ordered by signed_up_at (first-come-first-promoted).
    """

    size_cap: int
    seats_taken: int
    confirmed_count: int
    late_count: int
    tentative_count: int
    bench_count: int
    declined_count: int
    role_counts: RoleCounts
    is_full: bool
    bench_overflow: list[WowRaidSignup] = field(default_factory=list)

    @property
    def open_seats(self) -> int:
        return max(self.size_cap - self.seats_taken, 0)

    @property
    def signed_up_count(self) -> int:
        """Everyone who hasn't declined."""
        return self.seats_taken + self.tentative_count + self.bench_count


def compute_roster_summary(
    signups: Sequence[WowRaidSignup],
    *,
    size_cap: int,
) -> RosterSummary:
    """Compute the roster summary from a flat list of signup rows (any order)."""
    status_counts = {"confirmed": 0, "late": 0, TENTATIVE_STATUS: 0, DECLINED_STATUS: 0}
    bench_rows: list[WowRaidSignup] = []
    role_buckets: dict[str, int] = {"tank": 0, "healer": 0, "dps": 0, "unknown": 0}

    for signup in signups:
        if signup.status == BENCH_STATUS:
            bench_rows.append(signup)
            continue
        if signup.status not in status_counts:
            # Defensive — the CHECK constraint keeps unknown statuses out.
            continue
        status_counts[signup.status] += 1
        if signup.status in SEAT_STATUSES:
            bucket = signup.role if signup.role in RAID_ROLES else "unknown"
            role_buckets[bucket] += 1

    bench_rows.sort(key=lambda s: s.signed_up_at)
    seats_taken = status_counts["confirmed"] + status_counts["late"]

    return RosterSummary(
        size_cap=size_cap,
        seats_taken=seats_taken,
        confirmed_count=status_counts["confirmed"],
        late_count=status_counts["late"],
        tentative_count=status_counts[TENTATIVE_STATUS],
        bench_count=len(bench_rows),
        declined_count=status_counts[DECLINED_STATUS],
        role_counts=RoleCounts(
            tank=role_buckets["tank"],
            healer=role_buckets["healer"],
            dps=role_buckets["dps"],
            unknown=role_buckets["unknown"],
        ),
        is_full=seats_taken >= size_cap,
        bench_overflow=bench_rows,
    )


def seat_status_for(
    signups: Sequence[WowRaidSignup],
    *,
    discord_user_id: str,
    requested_status: str,
    size_cap: int,
) -> str:
    """Status a request actually lands on: the requested one, or ``bench``.

    Only seat-holding requests can be benched.  A player who already holds a
    seat keeps it when switching between ``confirmed`` and ``late``.
    """
    if requested_status not in SEAT_STATUSES:
        return requested_status
    mine = next((s for s in signups if s.discord_user_id == discord_user_id), None)
    if mine is not None and mine.status in SEAT_STATUSES:
        return requested_status
    others_seated = sum(
        1 for s in signups if s.status in SEAT_STATUSES and s.discord_user_id != discord_user_id
    )
    # A benched player re-clicking stays benched while the raid is full; the
    # service promotes after every change, so an open seat with a non-empty
    # bench never persists — nobody can jump the queue this way.
    if others_seated >= size_cap:
        return BENCH_STATUS
    return requested_status


def pick_promotions(
    signups: Sequence[WowRaidSignup],
    *,
    size_cap: int,
) -> list[WowRaidSignup]:
    """Bench signups to promote (FIFO) to fill the open seats."""
    summary = compute_roster_summary(signups, size_cap=size_cap)
    return summary.bench_overflow[: summary.open_seats]
