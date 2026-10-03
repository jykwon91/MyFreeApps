"""A raid's groups, pure: raid_groups, the page's groups (raid_web_view) and the planner (raid_plan_view).

A place counts only while its player holds a seat and its group is within
the raid's size; the page shows the groups only while the leader shares
them; the planner lists the seated players and nobody else.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import GROUP_SIZE, MAX_GROUPS, WowRaidSignup
from app.services.wow.raid_groups import (
    INVALID_PLAN,
    Placement,
    check_plan,
    group_count,
    groups_view,
    live_assignments,
)
from app.services.wow.raid_icon_files import ICONS_VERSION
from app.services.wow.raid_plan_view import build_plan
from app.services.wow.raid_web_view import build_page

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EXPIRES = _NOW + timedelta(hours=2)


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "web_id": uuid.uuid4(),
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "723456789012345678",
        "message_id": "910000000000000001",
        "created_by_user_id": "523456789012345678",
        "created_by_display_name": "Thrall",
        "groups_version": 0,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _signup(
    name: str,
    *,
    minute: int,
    status: str = "confirmed",
    group: int | None = None,
    slot: int | None = None,
    wow_class: str = "warrior",
    role: str = "dps",
    spec: str = "fury",
    note: str | None = None,
) -> WowRaidSignup:
    return WowRaidSignup(
        id=uuid.uuid4(),
        event_id=uuid.uuid4(),
        discord_user_id=str(300000000000000000 + minute),
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        note=note,
        raid_group=group,
        group_slot=slot,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _roster() -> list[WowRaidSignup]:
    """Two groups planned, then the roster moved on: a bench and a tentative player kept their places."""
    return [
        _signup("Garrosh", minute=0, group=1, slot=1, wow_class="warrior", role="tank", spec="protection"),
        _signup("Anduin", minute=1, group=1, slot=3, status="late", wow_class="priest", role="healer", spec="holy"),
        _signup("Varian", minute=2, group=2, slot=2, note="brings fire resist"),
        _signup("Jaina", minute=3, group=2, slot=1, wow_class="mage", spec="frost"),
        _signup("Valeera", minute=4, wow_class="rogue", spec="combat"),
        _signup("Rexxar", minute=5, group=1, slot=2, status="bench", wow_class="hunter", spec="marksmanship"),
        _signup("Velen", minute=6, group=2, slot=3, status="tentative", wow_class="priest", spec="shadow"),
        _signup("Tyrande", minute=7, status="queued", wow_class="priest", role="healer", spec="holy"),
    ]


def _names(signups: list[WowRaidSignup]) -> list[str]:
    return [signup.display_name for signup in signups]


# ---------------------------------------------------------------------------
# How many groups, and who is in one
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("size_cap", "groups"), [(1, 1), (5, 1), (6, 2), (10, 2), (20, 4), (25, 5), (40, 8), (45, MAX_GROUPS)]
)
def test_a_raid_has_the_groups_of_five_that_hold_it_at_most_eight(size_cap: int, groups: int) -> None:
    assert group_count(size_cap) == groups


def test_only_seated_players_have_a_place() -> None:
    signups = _roster()
    by_name = {signup.display_name: signup for signup in signups}
    live = live_assignments(_event(), signups)
    assert {name: live[by_name[name].id] for name in ("Garrosh", "Anduin", "Varian", "Jaina")} == {
        "Garrosh": (1, 1),
        "Anduin": (1, 3),
        "Varian": (2, 2),
        "Jaina": (2, 1),
    }
    assert len(live) == 4  # Rexxar (bench) and Velen (tentative) kept theirs, which no longer count


def test_a_group_past_a_lowered_size_drops_out() -> None:
    signups = [_signup("Garrosh", minute=0, group=1, slot=1), _signup("Thrall", minute=1, group=3, slot=1)]
    assert list(live_assignments(_event(size_cap=10), signups).values()) == [(1, 1)]
    assert len(live_assignments(_event(size_cap=15), signups)) == 2


# ---------------------------------------------------------------------------
# Checking a save
# ---------------------------------------------------------------------------


def test_a_plan_of_the_raids_seated_players_is_kept_whole() -> None:
    signups = _roster()
    placements = [Placement(signups[0].id, 1, 1), Placement(signups[4].id, 8, 5), Placement(signups[1].id, 1, 2)]
    check = check_plan(_event(), signups, placements)
    assert (check.valid, check.dropped, check.error) == (placements, [], None)
    assert check_plan(_event(), signups, []) == check_plan(_event(), [], [])


def test_a_player_who_lost_their_seat_meanwhile_is_left_out_and_named() -> None:
    signups = _roster()
    by_name = {signup.display_name: signup for signup in signups}
    placements = [
        Placement(by_name["Garrosh"].id, 1, 1),
        Placement(by_name["Rexxar"].id, 1, 2),
        Placement(by_name["Tyrande"].id, 2, 1),
    ]
    check = check_plan(_event(), signups, placements)
    assert check.error is None
    assert check.valid == placements[:1]
    assert _names(check.dropped) == ["Rexxar", "Tyrande"]


@pytest.mark.parametrize(
    "case",
    ["another raid's player", "a player twice", "two players in one slot", "group 0", "past the groups", "slot 0",
     "slot 6"],
)
def test_a_plan_that_does_not_fit_the_raid_is_refused_whole(case: str) -> None:
    signups = _roster()
    first, second = signups[0].id, signups[2].id
    placements = {
        "another raid's player": [Placement(first, 1, 1), Placement(uuid.uuid4(), 1, 2)],
        "a player twice": [Placement(first, 1, 1), Placement(first, 2, 1)],
        "two players in one slot": [Placement(first, 1, 1), Placement(second, 1, 1)],
        "group 0": [Placement(first, 0, 1)],
        "past the groups": [Placement(first, 3, 1)],
        "slot 0": [Placement(first, 1, 0)],
        "slot 6": [Placement(first, 1, GROUP_SIZE + 1)],
    }[case]
    check = check_plan(_event(size_cap=10), signups, placements)
    assert (check.valid, check.dropped, check.error) == ([], [], INVALID_PLAN)


# ---------------------------------------------------------------------------
# The groups as raiders see them
# ---------------------------------------------------------------------------


def test_the_groups_are_in_order_their_players_in_slot_order() -> None:
    view = groups_view(_event(), _roster())
    assert [(group.number, _names(group.members)) for group in view.groups] == [
        (1, ["Garrosh", "Anduin"]),
        (2, ["Jaina", "Varian"]),
    ]
    assert view.unplaced == 1  # Valeera; the bench, the maybe and the queue have no seat to place


def test_nobody_placed_means_no_groups_and_every_seat_unplaced() -> None:
    signups = [_signup("Garrosh", minute=0), _signup("Thrall", minute=1, group=3, slot=1)]
    view = groups_view(_event(size_cap=10), signups)
    assert (view.groups, view.unplaced) == ([], 2)


def test_the_page_shows_the_groups_only_while_the_leader_shares_them() -> None:
    signups = _roster()
    assert build_page(_event(), signups, discord_url=None, now=_NOW).groups is None

    saved = _NOW - timedelta(minutes=5)
    event = _event(groups_published_at=_NOW - timedelta(hours=1), groups_updated_at=saved)
    groups = build_page(event, signups, discord_url=None, now=_NOW).groups
    assert groups is not None
    assert [(group.number, [entry.name for entry in group.entries]) for group in groups.groups] == [
        (1, ["Garrosh", "Anduin"]),
        (2, ["Jaina", "Varian"]),
    ]
    garrosh, anduin = groups.groups[0].entries
    assert (garrosh.spec, garrosh.icon, garrosh.role_group, garrosh.late) == (
        "Protection Warrior", "warrior_protection", "tank", False
    )
    assert (anduin.late, anduin.number) == (True, None)
    assert (groups.unplaced, groups.updated_at) == (1, saved)


# ---------------------------------------------------------------------------
# The planner
# ---------------------------------------------------------------------------


def test_the_planner_lists_the_seated_players_in_line_order_with_their_places() -> None:
    signups = _roster()
    event = _event(groups_version=3, groups_updated_at=_NOW, size_cap=25)
    plan = build_plan(event, signups, link_expires_at=_EXPIRES, now=_NOW)
    assert [(p.name, p.number, p.group, p.slot, p.late) for p in plan.players] == [
        ("Garrosh", 1, 1, 1, False),
        ("Anduin", 2, 1, 3, True),
        ("Varian", 3, 2, 2, False),
        ("Jaina", 4, 2, 1, False),
        ("Valeera", 5, None, None, False),
    ]
    assert plan.players[0].id == signups[0].id
    assert (plan.web_id, plan.state, plan.size_cap, plan.group_count) == (event.web_id, "open", 25, 5)
    assert (plan.version, plan.published, plan.updated_at, plan.link_expires_at) == (3, False, _NOW, _EXPIRES)
    assert (plan.notes_enabled, plan.icons_version) == (False, ICONS_VERSION)


def test_the_planner_shows_notes_only_while_the_raid_takes_them() -> None:
    signups = _roster()
    hidden = build_plan(_event(), signups, link_expires_at=_EXPIRES, now=_NOW)
    shown = build_plan(_event(signup_notes_enabled=True), signups, link_expires_at=_EXPIRES, now=_NOW)
    assert [player.note for player in hidden.players] == [None] * 5
    assert [player.note for player in shown.players] == [None, None, "brings fire resist", None, None]
    assert shown.notes_enabled is True


def test_the_planner_says_whether_raiders_see_the_groups_and_never_names_a_user() -> None:
    event = _event(groups_published_at=_NOW, status="cancelled")
    plan = build_plan(event, _roster(), link_expires_at=_EXPIRES, now=_NOW)
    assert (plan.published, plan.state) == (True, "cancelled")
    dumped = plan.model_dump_json()
    assert "300000000000000000" not in dumped and "queued" not in dumped
