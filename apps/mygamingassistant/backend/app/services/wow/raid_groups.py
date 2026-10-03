"""A raid's groups — PURE rules over (event, signups); no I/O.

The leader plans groups of five in the browser (Raid: Edit → [Groups]); a
sign-up's ``raid_group`` / ``group_slot`` is its place.  A place counts only
while its player holds a seat (``SEAT_STATUSES``) and its group is within
the raid's size (:func:`group_count`).  A player benched or gone, or a group
the cap no longer reaches, drops out of every reader at once; the next save
clears the pair.

* :func:`live_assignments` — where each seated player is.
* :func:`check_plan` — whether a save fits the raid, and who in it lost
  their seat meanwhile (left out, not an error).
* :func:`groups_view` — the groups as the page and the post's [Groups] show
  them.
"""
from __future__ import annotations

import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Final

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import GROUP_SIZE, MAX_GROUPS, WowRaidSignup
from app.services.wow.raid_roster import SEAT_STATUSES, in_line_order

INVALID_PLAN: Final = "invalid_plan"


@dataclass(frozen=True)
class Placement:
    """A player's place in a save: their sign-up, a group and a slot in it."""

    signup_id: uuid.UUID
    group: int
    slot: int


@dataclass(frozen=True)
class PlanCheck:
    """A save, checked: the places to keep, the players left out (no seat now) — or why it doesn't fit."""

    valid: list[Placement] = field(default_factory=list)
    dropped: list[WowRaidSignup] = field(default_factory=list)
    error: str | None = None


@dataclass(frozen=True)
class GroupView:
    """A group with anyone in it: its number and its players in slot order."""

    number: int
    members: list[WowRaidSignup]


@dataclass(frozen=True)
class GroupsView:
    """Every group with anyone in it, in order, and how many seated players are in none."""

    groups: list[GroupView]
    unplaced: int


def group_count(size_cap: int) -> int:
    """The groups of five that hold the raid, at most eight: 10 → 2, 25 → 5, 40 → 8."""
    return min(MAX_GROUPS, math.ceil(size_cap / GROUP_SIZE))


def live_assignments(event: WowRaidEvent, signups: Sequence[WowRaidSignup]) -> dict[uuid.UUID, tuple[int, int]]:
    """Each seated player's (group, slot), by sign-up id, for the groups the raid's size reaches."""
    groups = group_count(event.size_cap)
    live: dict[uuid.UUID, tuple[int, int]] = {}
    for signup in signups:
        if signup.raid_group is None or signup.group_slot is None or signup.status not in SEAT_STATUSES:
            continue
        if signup.raid_group <= groups:
            live[signup.id] = (signup.raid_group, signup.group_slot)
    return live


def check_plan(event: WowRaidEvent, signups: Sequence[WowRaidSignup], placements: Sequence[Placement]) -> PlanCheck:
    """Whether *placements* fit the raid: every player one of its own, once, in one free slot of its groups.

    Anything else — a sign-up from another raid, a player twice, two players
    in one slot, a group past the raid's size — is ``invalid_plan``.  A player
    of the raid who has no seat now is left out and reported: they lost it
    while the leader planned.
    """
    by_id = {signup.id: signup for signup in signups}
    groups = group_count(event.size_cap)
    seen_players: set[uuid.UUID] = set()
    seen_slots: set[tuple[int, int]] = set()
    valid: list[Placement] = []
    dropped: list[WowRaidSignup] = []
    for placement in placements:
        signup = by_id.get(placement.signup_id)
        slot = (placement.group, placement.slot)
        if signup is None or placement.signup_id in seen_players or slot in seen_slots:
            return PlanCheck(error=INVALID_PLAN)
        if not (1 <= placement.group <= groups and 1 <= placement.slot <= GROUP_SIZE):
            return PlanCheck(error=INVALID_PLAN)
        seen_players.add(placement.signup_id)
        seen_slots.add(slot)
        if signup.status in SEAT_STATUSES:
            valid.append(placement)
        else:
            dropped.append(signup)
    return PlanCheck(valid=valid, dropped=dropped)


def groups_view(event: WowRaidEvent, signups: Sequence[WowRaidSignup]) -> GroupsView:
    """The raid's groups with anyone in them, players in slot order; the seated players in none, counted."""
    live = live_assignments(event, signups)
    members: dict[int, list[tuple[int, WowRaidSignup]]] = {}
    unplaced = 0
    for signup in in_line_order(signups):
        if signup.status not in SEAT_STATUSES:
            continue
        place = live.get(signup.id)
        if place is None:
            unplaced += 1
            continue
        group, slot = place
        members.setdefault(group, []).append((slot, signup))
    views = [
        GroupView(number=group, members=[signup for _slot, signup in sorted(members[group], key=lambda m: m[0])])
        for group in sorted(members)
    ]
    return GroupsView(groups=views, unplaced=unplaced)
