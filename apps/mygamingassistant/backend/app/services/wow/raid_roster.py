"""Raid roster summary + seat rules — pure, stateless, no DB access.

Computes the roster state from a list of WowRaidSignup rows and a size_cap.
Used by the signup embed, the signup service (who gets a seat, who is
queued, who moves up) and the /raid list counts.

Seat rules (Raid-Helper's ``queue_bench`` behaviour)
----------------------------------------------------
* **Seat-holding statuses** are ``confirmed`` and ``late`` — both players are
  coming.  ``tentative`` does NOT hold a seat: a "maybe" must never push a
  sure player into the queue.
* The raid is full when seat holders ≥ ``size_cap``.  A request for a seat
  when full lands in the **queue** (``queued``).
* Queued players move up automatically, first in line first.  When a seat
  holder leaves, the earliest queued player of the same role goes first, so a
  tank who drops isn't replaced by a sixth rogue; with nobody of that role
  queued, the earliest queued player goes.
* The queue is ordered by ``signed_up_at`` — the signup service resets it
  when a player *joins* the queue, so the timestamp means "joined the line".
* ``bench`` is a backup the player chose.  It holds no seat, and nobody is
  moved off it automatically.
* ``absence`` ("can't make it") never counts toward anything.

Order numbers
-------------
Seat holders and the queue share one numbered line, earliest ``signed_up_at``
first.  Switching spec, class, or between confirmed and late keeps your
number; taking a seat again after tentative, bench or absence puts you at the
end (Raid-Helper's ``preserve_order: half``) — the signup service resets
``signed_up_at`` then.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Final

from app.models.wow.wow_raid_signup import RAID_ROLES, SIGNUP_STATUSES, WowRaidSignup

SEAT_STATUSES: Final = ("confirmed", "late")
QUEUED_STATUS: Final = "queued"
BENCH_STATUS: Final = "bench"
TENTATIVE_STATUS: Final = "tentative"
ABSENCE_STATUS: Final = "absence"
# The numbered line: seat holders, then the queue behind them.
LINE_STATUSES: Final = (*SEAT_STATUSES, QUEUED_STATUS)
# What a member can ask for; only the bot puts anyone in the queue.
REQUESTABLE_STATUSES: Final = tuple(s for s in SIGNUP_STATUSES if s != QUEUED_STATUS)


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
    confirmed_count / late_count / tentative_count / bench_count /
    queued_count / absence_count:
        Per-status counts (``confirmed_count + late_count == seats_taken``).
    role_counts:
        Breakdown of seat holders by role.
    is_full:
        True when seats_taken >= size_cap.
    queue:
        Queued signups in line order (first moves up first).
    """

    size_cap: int
    seats_taken: int
    confirmed_count: int
    late_count: int
    tentative_count: int
    bench_count: int
    queued_count: int
    absence_count: int
    role_counts: RoleCounts
    is_full: bool
    queue: list[WowRaidSignup] = field(default_factory=list)

    @property
    def open_seats(self) -> int:
        return max(self.size_cap - self.seats_taken, 0)

    @property
    def signed_up_count(self) -> int:
        """Everyone who hasn't marked absence."""
        return self.seats_taken + self.tentative_count + self.bench_count + self.queued_count


def compute_roster_summary(
    signups: Sequence[WowRaidSignup],
    *,
    size_cap: int,
) -> RosterSummary:
    """Compute the roster summary from a flat list of signup rows (any order)."""
    status_counts = dict.fromkeys(SIGNUP_STATUSES, 0)
    queue: list[WowRaidSignup] = []
    role_buckets: dict[str, int] = {"tank": 0, "healer": 0, "dps": 0, "unknown": 0}

    for signup in signups:
        if signup.status not in status_counts:
            # Defensive — the CHECK constraint keeps unknown statuses out.
            continue
        status_counts[signup.status] += 1
        if signup.status == QUEUED_STATUS:
            queue.append(signup)
        elif signup.status in SEAT_STATUSES:
            bucket = signup.role if signup.role in RAID_ROLES else "unknown"
            role_buckets[bucket] += 1

    queue.sort(key=_line_key)
    seats_taken = status_counts["confirmed"] + status_counts["late"]

    return RosterSummary(
        size_cap=size_cap,
        seats_taken=seats_taken,
        confirmed_count=status_counts["confirmed"],
        late_count=status_counts["late"],
        tentative_count=status_counts[TENTATIVE_STATUS],
        bench_count=status_counts[BENCH_STATUS],
        queued_count=len(queue),
        absence_count=status_counts[ABSENCE_STATUS],
        role_counts=RoleCounts(
            tank=role_buckets["tank"],
            healer=role_buckets["healer"],
            dps=role_buckets["dps"],
            unknown=role_buckets["unknown"],
        ),
        is_full=seats_taken >= size_cap,
        queue=queue,
    )


def seat_status_for(
    signups: Sequence[WowRaidSignup],
    *,
    discord_user_id: str,
    requested_status: str,
    size_cap: int,
) -> str:
    """Status a request actually lands on: the requested one, or ``queued``.

    Only seat requests can be queued.  A player who already holds a seat
    keeps it when switching between ``confirmed`` and ``late``.
    """
    if requested_status not in SEAT_STATUSES:
        return requested_status
    mine = next((s for s in signups if s.discord_user_id == discord_user_id), None)
    if mine is not None and mine.status in SEAT_STATUSES:
        return requested_status
    others_seated = sum(
        1 for s in signups if s.status in SEAT_STATUSES and s.discord_user_id != discord_user_id
    )
    # A queued player asking again stays queued while the raid is full; the
    # service promotes after every change, so an open seat with a non-empty
    # queue never persists — nobody can jump the line this way.
    if others_seated >= size_cap:
        return QUEUED_STATUS
    return requested_status


def pick_promotions(
    signups: Sequence[WowRaidSignup],
    *,
    size_cap: int,
    prefer_role: str | None = None,
) -> list[WowRaidSignup]:
    """Queued signups to move into the open seats, first in line first.

    ``prefer_role`` is the role of a seat holder who just left: the earliest
    queued player of that role takes the first open seat, if there is one.
    """
    summary = compute_roster_summary(signups, size_cap=size_cap)
    queue = list(summary.queue)
    if not summary.open_seats or not queue:
        return []
    picked: list[WowRaidSignup] = []
    if prefer_role is not None:
        same_role = next((s for s in queue if s.role == prefer_role), None)
        if same_role is not None:
            picked.append(same_role)
            queue.remove(same_role)
    picked.extend(queue[: summary.open_seats - len(picked)])
    return picked


def hands_seat_to_queue(
    signups: Iterable[WowRaidSignup], *, discord_user_id: str, requested_status: str
) -> bool:
    """A seat holder asking for a non-seat status while players are queued.

    Their seat goes to the queue at once and coming back means the back of
    the line, so the bot asks before applying it.
    """
    if requested_status in SEAT_STATUSES:
        return False
    rows = list(signups)
    mine = next((s for s in rows if s.discord_user_id == discord_user_id), None)
    if mine is None or mine.status not in SEAT_STATUSES:
        return False
    return any(s.status == QUEUED_STATUS for s in rows)


def order_numbers(signups: Iterable[WowRaidSignup]) -> dict[str, int]:
    """Order number (1 = earliest) per user id, for seat holders and the queue."""
    line = sorted((s for s in signups if s.status in LINE_STATUSES), key=_line_key)
    return {signup.discord_user_id: number for number, signup in enumerate(line, start=1)}


def queue_position(signups: Iterable[WowRaidSignup], discord_user_id: str) -> int | None:
    """1-based place in the queue, or None when the player isn't queued."""
    queue = sorted((s for s in signups if s.status == QUEUED_STATUS), key=_line_key)
    return next(
        (place for place, signup in enumerate(queue, start=1) if signup.discord_user_id == discord_user_id),
        None,
    )


def in_line_order(signups: Iterable[WowRaidSignup]) -> list[WowRaidSignup]:
    """Earliest ``signed_up_at`` first, ties by user id: the order every list shows."""
    return sorted(signups, key=_line_key)


def ordered_user_ids(signups: Iterable[WowRaidSignup]) -> list[str]:
    """User ids in signup order, earliest first, so mentions read like the roster.

    Ties go by user id, so two workers scheduling the same players insert
    their rows in the same order (no deadlock between them).
    """
    return [s.discord_user_id for s in in_line_order(signups)]


def _line_key(signup: WowRaidSignup) -> tuple[datetime, str]:
    return (signup.signed_up_at, signup.discord_user_id)
