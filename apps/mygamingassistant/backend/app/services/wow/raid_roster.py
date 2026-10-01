"""Raid roster summary — pure, stateless, no DB access.

Computes the roster state from a list of WowRaidSignup rows and a size_cap.
Used by the embed builder (future phase) and surfaced to tests directly.

Design choices
--------------
* Pure function — deterministic, easily unit-tested without DB fixtures.
* Bench ordering: by ``signed_up_at`` ASC (first-come-first-bench semantics).
* A signup without a role is counted in its status bucket under role=None.
* Declined signups are tracked separately (they never count toward cap).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from app.models.wow.wow_raid_signup import RAID_ROLES, SIGNUP_STATUSES, WowRaidSignup

# Statuses that count toward the cap (ordered by priority).
_ACTIVE_STATUSES = ("confirmed", "late", "tentative")
# Statuses that go to the bench overflow pool.
_BENCH_STATUS = "bench"
_DECLINED_STATUS = "declined"


@dataclass(frozen=True)
class RoleCounts:
    """Confirmed/active counts for one role."""

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
    confirmed_count:
        Number of signups whose status is 'confirmed', 'late', or 'tentative'
        — these count toward the cap.
    bench_count:
        Number of signups with status 'bench'.
    declined_count:
        Number of signups with status 'declined'.
    role_counts:
        Breakdown of confirmed/active signups by role.
    is_full:
        True when confirmed_count >= size_cap.
    bench_overflow:
        Bench signups ordered by signed_up_at (first-come-first-bench).
    """

    size_cap: int
    confirmed_count: int
    bench_count: int
    declined_count: int
    role_counts: RoleCounts
    is_full: bool
    bench_overflow: list[WowRaidSignup] = field(default_factory=list)


def compute_roster_summary(
    signups: list[WowRaidSignup],
    *,
    size_cap: int,
) -> RosterSummary:
    """Compute the roster summary from a flat list of signup rows.

    Parameters
    ----------
    signups:
        All WowRaidSignup rows for one event, in any order.
    size_cap:
        The event's ``size_cap`` value.

    Returns
    -------
    RosterSummary
        A frozen snapshot of the roster state.
    """
    confirmed_count = 0
    bench_rows: list[WowRaidSignup] = []
    declined_count = 0

    # Per-role counts (active/confirmed signups only).
    role_buckets: dict[str, int] = {"tank": 0, "healer": 0, "dps": 0, "unknown": 0}

    for signup in signups:
        if signup.status in _ACTIVE_STATUSES:
            confirmed_count += 1
            bucket = signup.role if signup.role in RAID_ROLES else "unknown"
            role_buckets[bucket] += 1
        elif signup.status == _BENCH_STATUS:
            bench_rows.append(signup)
        elif signup.status == _DECLINED_STATUS:
            declined_count += 1
        # Any unknown status is silently ignored — the CheckConstraint prevents
        # invalid values from reaching the DB; this is defensive.

    # Bench overflow ordered by signed_up_at (earliest first = highest priority).
    bench_rows.sort(key=lambda s: s.signed_up_at)

    return RosterSummary(
        size_cap=size_cap,
        confirmed_count=confirmed_count,
        bench_count=len(bench_rows),
        declined_count=declined_count,
        role_counts=RoleCounts(
            tank=role_buckets["tank"],
            healer=role_buckets["healer"],
            dps=role_buckets["dps"],
            unknown=role_buckets["unknown"],
        ),
        is_full=confirmed_count >= size_cap,
        bench_overflow=bench_rows,
    )
