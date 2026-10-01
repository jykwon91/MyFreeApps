"""Unit tests for app.services.wow.raid_roster.compute_roster_summary.

Pure-Python: no DB, no fixtures, no async.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_roster import (
    RoleCounts,
    compute_roster_summary,
    hands_seat_to_queue,
    order_numbers,
    pick_promotions,
    queue_position,
    seat_status_for,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BASE_TS = datetime(2026, 12, 9, 19, 0, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.uuid4()


def _signup(
    *,
    status: str = "confirmed",
    role: str | None = "dps",
    wow_class: str | None = "warrior",
    signed_up_at: datetime = _BASE_TS,
    discord_user_id: str | None = None,
) -> WowRaidSignup:
    """Construct a WowRaidSignup without hitting the DB.

    Uses the ORM constructor so SQLAlchemy instance state is properly
    initialised.  No session needed — validation only fires at flush time.
    """
    return WowRaidSignup(
        event_id=_EVENT_ID,
        discord_user_id=discord_user_id or str(uuid.uuid4().int)[:18],
        display_name="Testplayer",
        status=status,
        wow_class=wow_class,
        role=role,
        signed_up_at=signed_up_at,
        updated_at=signed_up_at,
    )


# ---------------------------------------------------------------------------
# Basic counts
# ---------------------------------------------------------------------------


def test_empty_roster():
    summary = compute_roster_summary([], size_cap=25)
    assert summary.confirmed_count == 0
    assert summary.bench_count == 0
    assert summary.queued_count == 0
    assert summary.absence_count == 0
    assert summary.is_full is False
    assert summary.role_counts == RoleCounts(0, 0, 0, 0)
    assert summary.queue == []


def test_confirmed_increments_count():
    signups = [_signup(status="confirmed", role="tank") for _ in range(3)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.confirmed_count == 3
    assert summary.role_counts.tank == 3


def test_late_counts_toward_cap():
    signups = [_signup(status="late", role="healer") for _ in range(2)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.seats_taken == 2
    assert summary.late_count == 2
    assert summary.confirmed_count == 0
    assert summary.role_counts.healer == 2


def test_tentative_does_not_hold_a_seat():
    # A "maybe" must never push a sure player into the queue.
    signups = [_signup(status="tentative", role="dps") for _ in range(5)]
    summary = compute_roster_summary(signups, size_cap=5)
    assert summary.seats_taken == 0
    assert summary.tentative_count == 5
    assert summary.is_full is False
    assert summary.role_counts.dps == 0


def test_queue_and_bench_do_not_count_toward_cap():
    signups = [_signup(status="queued", role="dps") for _ in range(10)]
    signups += [_signup(status="bench", role="dps") for _ in range(3)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.confirmed_count == 0
    assert summary.queued_count == 10
    assert summary.bench_count == 3
    assert len(summary.queue) == 10
    assert summary.is_full is False


def test_absence_tracked_separately():
    signups = [_signup(status="absence", role=None) for _ in range(4)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.absence_count == 4
    assert summary.confirmed_count == 0
    assert summary.signed_up_count == 0


# ---------------------------------------------------------------------------
# is_full
# ---------------------------------------------------------------------------


def test_is_full_at_cap():
    signups = [_signup(status="confirmed", role="dps") for _ in range(25)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.is_full is True


def test_is_full_exceeds_cap():
    # More confirmed than cap — still full (the embed builder handles overbooking)
    signups = [_signup(status="confirmed", role="dps") for _ in range(30)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.is_full is True
    assert summary.confirmed_count == 30


def test_is_not_full_one_below():
    signups = [_signup(status="confirmed", role="dps") for _ in range(24)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.is_full is False


# ---------------------------------------------------------------------------
# Role breakdown
# ---------------------------------------------------------------------------


def test_mixed_roles():
    signups = (
        [_signup(role="tank") for _ in range(2)]
        + [_signup(role="healer") for _ in range(5)]
        + [_signup(role="dps") for _ in range(15)]
    )
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.role_counts.tank == 2
    assert summary.role_counts.healer == 5
    assert summary.role_counts.dps == 15
    assert summary.role_counts.unknown == 0
    assert summary.role_counts.total == 22


def test_no_role_counted_as_unknown():
    signups = [_signup(role=None, status="confirmed") for _ in range(3)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.role_counts.unknown == 3
    assert summary.confirmed_count == 3


# ---------------------------------------------------------------------------
# Queue ordering
# ---------------------------------------------------------------------------


def test_queue_ordered_by_signed_up_at():
    t0 = _BASE_TS
    last = _signup(status="queued", signed_up_at=t0 + timedelta(minutes=30))
    first = _signup(status="queued", signed_up_at=t0)
    middle = _signup(status="queued", signed_up_at=t0 + timedelta(minutes=15))
    # Pass in reverse order — result must be sorted ascending.
    summary = compute_roster_summary([last, middle, first], size_cap=25)
    assert summary.queue == [first, middle, last]


# ---------------------------------------------------------------------------
# Mixed snapshot
# ---------------------------------------------------------------------------


def test_full_roster_snapshot():
    """Smoke test with a realistic mix of all statuses."""
    signups = (
        [_signup(status="confirmed", role="tank") for _ in range(3)]
        + [_signup(status="confirmed", role="healer") for _ in range(5)]
        + [_signup(status="confirmed", role="dps") for _ in range(17)]
        + [_signup(status="queued", role="dps") for _ in range(4)]
        + [_signup(status="bench", role="healer") for _ in range(2)]
        + [_signup(status="absence", role=None) for _ in range(2)]
        + [_signup(status="tentative", role="dps") for _ in range(1)]
    )
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.seats_taken == 25  # 3+5+17; tentative holds no seat
    assert summary.tentative_count == 1
    assert summary.queued_count == 4
    assert summary.bench_count == 2
    assert summary.absence_count == 2
    assert summary.is_full is True
    assert summary.role_counts.total == 25
    assert summary.signed_up_count == 32  # everyone but the absences


# ---------------------------------------------------------------------------
# seat_status_for / pick_promotions / order numbers
# ---------------------------------------------------------------------------


def _seated(count: int, role: str = "dps") -> list[WowRaidSignup]:
    return [
        _signup(discord_user_id=f"seat{i}", role=role, signed_up_at=_BASE_TS + timedelta(minutes=i))
        for i in range(count)
    ]


def _queued(user_id: str, minutes: int, role: str = "dps") -> WowRaidSignup:
    return _signup(
        status="queued",
        role=role,
        discord_user_id=user_id,
        signed_up_at=_BASE_TS + timedelta(hours=1, minutes=minutes),
    )


def test_seat_request_with_room_is_granted():
    assert seat_status_for(_seated(2), discord_user_id="new", requested_status="confirmed", size_cap=3) == "confirmed"


def test_seat_request_when_full_is_queued():
    assert seat_status_for(_seated(3), discord_user_id="new", requested_status="confirmed", size_cap=3) == "queued"
    assert seat_status_for(_seated(3), discord_user_id="new", requested_status="late", size_cap=3) == "queued"


def test_non_seat_requests_are_never_queued():
    for status in ("tentative", "bench", "absence"):
        assert seat_status_for(_seated(3), discord_user_id="new", requested_status=status, size_cap=3) == status


def test_seat_holder_switching_confirmed_late_keeps_seat():
    signups = _seated(3)
    assert seat_status_for(signups, discord_user_id="seat1", requested_status="late", size_cap=3) == "late"


def test_queued_player_stays_queued_while_full():
    signups = _seated(3) + [_queued("q1", 0)]
    assert seat_status_for(signups, discord_user_id="q1", requested_status="confirmed", size_cap=3) == "queued"


def test_backup_asking_for_a_seat_gets_one_if_open_else_joins_the_queue():
    bench = _signup(status="bench", discord_user_id="b1")
    open_raid = _seated(2) + [bench]
    full_raid = _seated(3) + [bench]
    assert seat_status_for(open_raid, discord_user_id="b1", requested_status="confirmed", size_cap=3) == "confirmed"
    assert seat_status_for(full_raid, discord_user_id="b1", requested_status="confirmed", size_cap=3) == "queued"


def test_pick_promotions_fifo_into_open_seats():
    signups = _seated(1) + [_queued("second", 2), _queued("first", 1), _queued("third", 3)]
    promoted = pick_promotions(signups, size_cap=3)
    assert [s.discord_user_id for s in promoted] == ["first", "second"]


def test_pick_promotions_none_when_full():
    signups = _seated(3) + [_queued("q1", 0)]
    assert pick_promotions(signups, size_cap=3) == []


def test_backups_are_never_promoted():
    signups = _seated(1) + [_signup(status="bench", discord_user_id="b1")]
    assert pick_promotions(signups, size_cap=3) == []


def test_a_leaving_tank_is_replaced_by_the_first_queued_tank():
    queue = [_queued("rogue", 1), _queued("tank", 2, role="tank"), _queued("tank2", 3, role="tank")]
    promoted = pick_promotions(_seated(2) + queue, size_cap=3, prefer_role="tank")
    assert [s.discord_user_id for s in promoted] == ["tank"]


def test_with_no_queued_player_of_that_role_the_first_in_line_moves_up():
    signups = _seated(2) + [_queued("rogue", 1), _queued("mage", 2)]
    promoted = pick_promotions(signups, size_cap=3, prefer_role="healer")
    assert [s.discord_user_id for s in promoted] == ["rogue"]


def test_order_numbers_cover_seats_and_queue_only():
    signups = _seated(2) + [
        _queued("q1", 0),
        _signup(status="late", discord_user_id="late", signed_up_at=_BASE_TS + timedelta(minutes=30)),
        _signup(status="tentative", discord_user_id="maybe", signed_up_at=_BASE_TS),
        _signup(status="bench", discord_user_id="backup", signed_up_at=_BASE_TS),
        _signup(status="absence", discord_user_id="away", signed_up_at=_BASE_TS),
    ]
    assert order_numbers(signups) == {"seat0": 1, "seat1": 2, "late": 3, "q1": 4}


def test_a_seat_holder_leaving_while_players_queue_is_asked_first():
    signups = _seated(3) + [_queued("q1", 0)]
    for status in ("tentative", "bench", "absence"):
        assert hands_seat_to_queue(signups, discord_user_id="seat0", requested_status=status)


def test_no_seat_confirm_without_a_queue_or_a_seat_to_give_up():
    queue = [_queued("q1", 0)]
    backup = _signup(status="bench", discord_user_id="b1")
    # Nobody waiting: the seat just opens up.
    assert not hands_seat_to_queue(_seated(3), discord_user_id="seat0", requested_status="absence")
    # Confirmed <-> late keeps the seat.
    assert not hands_seat_to_queue(_seated(3) + queue, discord_user_id="seat0", requested_status="late")
    # Only a seat holder has a seat to give up.
    assert not hands_seat_to_queue(_seated(3) + queue, discord_user_id="q1", requested_status="absence")
    assert not hands_seat_to_queue(_seated(3) + queue + [backup], discord_user_id="b1", requested_status="absence")
    assert not hands_seat_to_queue(_seated(3) + queue, discord_user_id="new", requested_status="tentative")


def test_queue_position():
    signups = _seated(3) + [_queued("q2", 2), _queued("q1", 1)]
    assert queue_position(signups, "q1") == 1
    assert queue_position(signups, "q2") == 2
    assert queue_position(signups, "seat0") is None
