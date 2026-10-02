"""Unit tests for app.services.wow.raid_limits — role and class limits.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_catalog import WowSpecInfo, spec_info
from app.services.wow.raid_composition import RoleGaps
from app.services.wow.raid_limits import (
    LIMIT_ROLES,
    LimitCheck,
    LimitHit,
    Limits,
    changed_keys,
    clean_limits,
    count_label,
    limit_hit,
    over_limit,
    raid_gaps,
    role_line_counts,
    role_room,
    role_row,
)
from app.services.wow.raid_roster import RoleCounts

_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _T0 + timedelta(days=9),
        "size_cap": 10,
        "status": "scheduled",
        "channel_id": "c1",
        "created_by_user_id": "u0",
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _spec(wow_class: str, spec: str) -> WowSpecInfo:
    info = spec_info(wow_class, spec)
    assert info is not None
    return info


def _player(user: str, wow_class: str, spec: str, *, status: str = "confirmed", minute: int = 0) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=_EVENT_ID,
        discord_user_id=user,
        display_name=user,
        status=status,
        wow_class=wow_class,
        role=_spec(wow_class, spec).raid_role,
        spec=spec,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _limits(*, roles: dict[str, int] | None = None, classes: dict[str, int] | None = None) -> Limits:
    return Limits(roles=roles or {}, classes=classes or {})


def _hit(
    signups: list[WowRaidSignup], user: str, wow_class: str, spec: str, limits: Limits, *, status: str = "confirmed"
) -> LimitHit | None:
    return limit_hit(signups, discord_user_id=user, spec=_spec(wow_class, spec), status=status, limits=limits)


# ---------------------------------------------------------------------------
# Reading the stored limits
# ---------------------------------------------------------------------------


def test_stored_limits_keep_known_keys_and_whole_numbers_from_0_to_40_in_order() -> None:
    raw = {"healer": 4, "tank": 0, "ranged": 41, "melee": True, "bogus": 3}
    cleaned = clean_limits(raw, LIMIT_ROLES)
    assert cleaned == {"tank": 0, "healer": 4}
    assert list(cleaned) == ["tank", "healer"]  # role-row order, whatever order they were stored in
    assert clean_limits({"tank": -1, "healer": 2.5, "melee": "3"}, LIMIT_ROLES) == {}
    assert clean_limits(None, LIMIT_ROLES) == {}
    assert clean_limits([2, 4], LIMIT_ROLES) == {}


def test_a_raids_limits_and_what_each_post_button_shows() -> None:
    limits = Limits.of(_event(role_limits={"tank": 2}, class_limits={"rogue": 3, "tank": 1}))
    assert limits.roles == {"tank": 2}
    assert limits.classes == {"rogue": 3}  # the Tank column is never a class
    assert limits.for_column("tank") == 2  # [Tank] shows Max tanks
    assert limits.for_column("rogue") == 3
    assert limits.for_column("mage") is None
    assert Limits.of(_event()) == Limits(roles={}, classes={})


# ---------------------------------------------------------------------------
# What a limit refuses
# ---------------------------------------------------------------------------


def test_a_full_class_refuses_newcomers_but_not_its_own_players() -> None:
    signups = [_player("u1", "rogue", "combat"), _player("u2", "rogue", "subtlety", status="late")]
    limits = _limits(classes={"rogue": 2})
    assert _hit(signups, "u3", "rogue", "combat", limits) == LimitHit("class", "rogue", 2, 2)
    assert _hit(signups, "u3", "rogue", "combat", limits, status="late") == LimitHit("class", "rogue", 2, 2)
    # Someone already in it may switch spec, or between confirmed and late.
    assert _hit(signups, "u1", "rogue", "assassination", limits) is None
    assert _hit(signups, "u1", "rogue", "combat", limits, status="late") is None
    # Tentative, bench and absence are never refused.
    for status in ("tentative", "bench", "absence"):
        assert _hit(signups, "u3", "rogue", "combat", limits, status=status) is None


def test_the_queue_counts_and_tentative_bench_and_absence_dont() -> None:
    limits = _limits(classes={"rogue": 2})
    queued = [_player("u1", "rogue", "combat"), _player("u2", "rogue", "combat", status="queued")]
    assert _hit(queued, "u3", "rogue", "combat", limits) == LimitHit("class", "rogue", 2, 2)
    off_the_line = [
        _player("u1", "rogue", "combat"),
        _player("u2", "rogue", "combat", status="tentative"),
        _player("u4", "rogue", "combat", status="bench"),
        _player("u5", "rogue", "combat", status="absence"),
    ]
    assert _hit(off_the_line, "u3", "rogue", "combat", limits) is None
    # u2, queued, is in line already; a tentative player asking for a seat is joining it.
    assert _hit(queued, "u2", "rogue", "combat", limits) is None
    tentative = [queued[0], _player("u2", "rogue", "combat", status="tentative"), _player("u6", "rogue", "combat")]
    assert _hit(tentative, "u2", "rogue", "combat", limits) == LimitHit("class", "rogue", 2, 2)


def test_tank_specs_answer_only_to_the_tank_role_limit() -> None:
    no_warriors = _limits(classes={"warrior": 0})
    assert _hit([], "u1", "warrior", "protection", no_warriors) is None  # under Tanks, not Warrior
    assert _hit([], "u1", "warrior", "arms", no_warriors) == LimitHit("class", "warrior", 0, 0)
    one_tank = _limits(roles={"tank": 1})
    bear = [_player("u2", "druid", "feral-tank")]
    assert _hit(bear, "u1", "warrior", "protection", one_tank) == LimitHit("role", "tank", 1, 1)
    assert _hit(bear, "u2", "druid", "feral-tank", one_tank) is None


def test_the_class_is_the_reason_when_class_and_role_both_refuse() -> None:
    limits = _limits(roles={"melee": 1}, classes={"rogue": 1})
    signups = [_player("u1", "rogue", "combat")]
    assert _hit(signups, "u2", "rogue", "combat", limits) == LimitHit("class", "rogue", 1, 1)
    assert _hit(signups, "u2", "warrior", "fury", limits) == LimitHit("role", "melee", 1, 1)


def test_moving_to_another_column_or_role_is_joining_it() -> None:
    signups = [_player("u1", "mage", "frost"), _player("u2", "warlock", "affliction")]
    # u1 (a mage) is in neither Warlock nor melee, so the limits count them as joining.
    assert _hit(signups, "u1", "warlock", "destruction", _limits(classes={"warlock": 1})) == LimitHit(
        "class", "warlock", 1, 1
    )
    assert _hit(signups, "u1", "rogue", "combat", _limits(roles={"melee": 0})) == LimitHit("role", "melee", 0, 0)
    # Mage → Warlock stays ranged: the ranged limit doesn't refuse them.
    assert _hit(signups, "u1", "warlock", "destruction", _limits(roles={"ranged": 2})) is None


def test_a_lowered_limit_removes_nobody_but_stops_newcomers() -> None:
    signups = [_player(f"u{i}", "rogue", "combat", minute=i) for i in range(3)]
    limits = _limits(classes={"rogue": 2})
    assert _hit(signups, "u0", "rogue", "subtlety", limits) is None
    assert _hit(signups, "u9", "rogue", "combat", limits) == LimitHit("class", "rogue", 3, 2)


def test_a_player_without_a_spec_counts_under_their_class_but_no_role() -> None:
    no_spec = WowRaidSignup(
        event_id=_EVENT_ID, discord_user_id="u1", display_name="u1", status="confirmed",
        wow_class="rogue", role=None, spec=None, signed_up_at=_T0, updated_at=_T0,
    )
    assert _hit([no_spec], "u2", "rogue", "combat", _limits(classes={"rogue": 1})) == LimitHit("class", "rogue", 1, 1)
    assert _hit([no_spec], "u2", "rogue", "combat", _limits(roles={"melee": 1})) is None
    assert role_line_counts([no_spec]) == {"tank": 0, "melee": 0, "ranged": 0, "healer": 0}


# ---------------------------------------------------------------------------
# One player's check: marks and closed columns
# ---------------------------------------------------------------------------


def test_the_check_marks_the_specs_with_no_room() -> None:
    signups = [_player("u1", "druid", "balance"), _player("u2", "warrior", "protection")]
    check = LimitCheck(_limits(roles={"tank": 2}, classes={"druid": 1}), signups, "u3", "confirmed")
    blocks = check.blocks("druid")
    full = LimitHit("class", "druid", 1, 1)
    assert blocks == {
        _spec("druid", "balance"): full,
        _spec("druid", "feral-damage"): full,
        _spec("druid", "restoration"): full,
    }
    assert check.closed("druid") == []  # Feral (tank) still has room, under Tanks
    assert check.blocks("mage") == {}


def test_a_column_with_no_spec_left_is_closed_with_each_reason_once() -> None:
    signups = [_player("u1", "druid", "balance"), _player("u2", "warrior", "protection")]
    check = LimitCheck(_limits(roles={"tank": 1}, classes={"druid": 1}), signups, "u3", "confirmed")
    assert check.closed("druid") == [LimitHit("class", "druid", 1, 1), LimitHit("role", "tank", 1, 1)]
    assert check.closed("tank") == [LimitHit("role", "tank", 1, 1)]  # three tank specs, one reason
    # Tentative takes any spec.
    assert LimitCheck(check.limits, signups, "u3", "tentative").closed("druid") == []


@pytest.mark.parametrize(
    ("status", "listed"),
    [("confirmed", True), ("late", True), ("queued", True), ("tentative", True), ("bench", True), ("absence", False)],
)
def test_the_check_knows_whether_the_player_is_on_the_list(status: str, listed: bool) -> None:
    signups = [_player("u1", "mage", "frost", status=status), _player("u2", "mage", "fire")]
    check = LimitCheck(_limits(), signups, "u1", "confirmed")
    assert check.mine is signups[0]
    assert check.listed is listed


def test_a_player_not_signed_up_is_not_on_the_list() -> None:
    check = LimitCheck(_limits(), [_player("u2", "mage", "fire")], "u1", "confirmed")
    assert check.mine is None
    assert check.listed is False


# ---------------------------------------------------------------------------
# Counts on the post
# ---------------------------------------------------------------------------


def test_role_line_counts_count_the_players_in_line() -> None:
    signups = [
        _player("u1", "warrior", "protection"),
        _player("u2", "priest", "holy", status="late"),
        _player("u3", "hunter", "survival", status="queued"),
        _player("u4", "rogue", "combat", status="tentative"),
        _player("u5", "mage", "fire", status="bench"),
        _player("u6", "shaman", "elemental", status="absence"),
    ]
    assert role_line_counts(signups) == {"tank": 1, "melee": 0, "ranged": 1, "healer": 1}


def test_a_limited_count_reads_count_over_limit() -> None:
    assert count_label(3, None) == "3"
    assert count_label(3, 4) == "3/4"
    assert count_label(0, 0) == "0/0"


def test_the_role_row_shows_a_limited_role_in_line_over_its_limit() -> None:
    signups = [
        _player("u1", "warrior", "protection"),
        _player("u2", "druid", "feral-tank", status="queued"),
        _player("u3", "rogue", "combat"),
        _player("u4", "rogue", "combat", status="queued"),
    ]
    # Unlimited roles keep counting their seat holders, as before limits.
    assert role_row(signups, _limits()) == {"tank": "1", "melee": "1", "ranged": "0", "healer": "0"}
    assert role_row(signups, _limits(roles={"tank": 2, "healer": 0})) == {
        "tank": "2/2",
        "melee": "1",
        "ranged": "0",
        "healer": "0/0",
    }


# ---------------------------------------------------------------------------
# The sign-up nudge
# ---------------------------------------------------------------------------


def test_role_room_is_what_each_limited_role_still_takes() -> None:
    signups = [_player("u1", "warrior", "protection")] + [_player(f"h{i}", "priest", "holy") for i in range(4)]
    room = role_room(signups, _limits(roles={"tank": 2, "healer": 3}))
    assert room == {"tank": 1, "healer": 0}  # a lowered limit has no room, never less


def test_the_nudge_never_asks_for_players_the_limits_would_turn_away() -> None:
    signups = [_player("u1", "warrior", "protection")]
    seated = RoleCounts(tank=1)
    # A 10-player raid expects 2 tanks, 3 healers and 5 DPS.
    assert raid_gaps(_event(), signups, seated) == RoleGaps(tanks=1, healers=3, dps=5)
    capped = _event(role_limits={"tank": 1, "healer": 2})
    assert raid_gaps(capped, signups, seated) == RoleGaps(tanks=0, healers=2, dps=5)


# ---------------------------------------------------------------------------
# Raid: Edit — what a save changed, and what it left past its limit
# ---------------------------------------------------------------------------


def test_changed_keys_are_set_moved_or_cleared() -> None:
    assert changed_keys({"tank": 2, "healer": 4}, {"tank": 3, "healer": 4, "melee": 1}) == {"tank", "melee"}
    assert changed_keys({"tank": 2}, {}) == {"tank"}
    assert changed_keys({"tank": 2}, {"tank": 2}) == set()


def test_over_limit_names_the_changed_limits_already_past_roles_first() -> None:
    signups = [
        *(_player(f"t{i}", "warrior", "protection") for i in range(3)),
        _player("r1", "rogue", "combat"),
        _player("r2", "rogue", "combat", status="queued"),
        _player("r3", "rogue", "combat", status="tentative"),  # not in line
    ]
    limits = _limits(roles={"tank": 2, "healer": 0}, classes={"rogue": 1, "mage": 0, "warrior": 0})
    assert over_limit(signups, limits, {"rogue", "tank", "healer", "mage", "warrior"}) == [
        LimitHit("role", "tank", 3, 2),
        LimitHit("class", "rogue", 2, 1),
    ]  # at a limit isn't past it, and tank specs never count under Warrior
    assert over_limit(signups, limits, {"rogue"}) == [LimitHit("class", "rogue", 2, 1)]
    assert over_limit(signups, limits, set()) == []
