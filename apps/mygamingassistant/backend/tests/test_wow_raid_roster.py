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
    pick_promotions,
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
    assert summary.declined_count == 0
    assert summary.is_full is False
    assert summary.role_counts == RoleCounts(0, 0, 0, 0)
    assert summary.bench_overflow == []


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
    # A "maybe" must never push a sure player onto the bench.
    signups = [_signup(status="tentative", role="dps") for _ in range(5)]
    summary = compute_roster_summary(signups, size_cap=5)
    assert summary.seats_taken == 0
    assert summary.tentative_count == 5
    assert summary.is_full is False
    assert summary.role_counts.dps == 0


def test_bench_does_not_count_toward_cap():
    signups = [_signup(status="bench", role="dps") for _ in range(10)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.confirmed_count == 0
    assert summary.bench_count == 10
    assert summary.is_full is False


def test_declined_tracked_separately():
    signups = [_signup(status="declined", role=None) for _ in range(4)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.declined_count == 4
    assert summary.confirmed_count == 0
    assert summary.bench_count == 0


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
# Bench overflow ordering
# ---------------------------------------------------------------------------


def test_bench_ordered_by_signed_up_at():
    from datetime import timedelta

    t0 = _BASE_TS
    last = _signup(status="bench", signed_up_at=t0 + timedelta(minutes=30))
    first = _signup(status="bench", signed_up_at=t0)
    middle = _signup(status="bench", signed_up_at=t0 + timedelta(minutes=15))
    # Pass in reverse order — result must be sorted ascending.
    summary = compute_roster_summary(
        [last, middle, first], size_cap=25
    )
    assert summary.bench_overflow[0].signed_up_at == t0
    assert summary.bench_overflow[1].signed_up_at == t0 + timedelta(minutes=15)
    assert summary.bench_overflow[2].signed_up_at == t0 + timedelta(minutes=30)


# ---------------------------------------------------------------------------
# Mixed snapshot
# ---------------------------------------------------------------------------


def test_full_roster_snapshot():
    """Smoke test with a realistic mix of all statuses."""
    signups = (
        [_signup(status="confirmed", role="tank") for _ in range(3)]
        + [_signup(status="confirmed", role="healer") for _ in range(5)]
        + [_signup(status="confirmed", role="dps") for _ in range(17)]
        + [_signup(status="bench", role="dps") for _ in range(4)]
        + [_signup(status="declined", role=None) for _ in range(2)]
        + [_signup(status="tentative", role="dps") for _ in range(1)]
    )
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.seats_taken == 25  # 3+5+17; tentative holds no seat
    assert summary.tentative_count == 1
    assert summary.bench_count == 4
    assert summary.declined_count == 2
    assert summary.is_full is True
    assert summary.role_counts.total == 25
    assert summary.signed_up_count == 30


# ---------------------------------------------------------------------------
# seat_status_for / pick_promotions
# ---------------------------------------------------------------------------


def _seated(count: int) -> list[WowRaidSignup]:
    return [
        _signup(discord_user_id=f"seat{i}", signed_up_at=_BASE_TS + timedelta(minutes=i))
        for i in range(count)
    ]


def test_seat_request_with_room_is_granted():
    assert seat_status_for(_seated(2), discord_user_id="new", requested_status="confirmed", size_cap=3) == "confirmed"


def test_seat_request_when_full_is_benched():
    assert seat_status_for(_seated(3), discord_user_id="new", requested_status="confirmed", size_cap=3) == "bench"
    assert seat_status_for(_seated(3), discord_user_id="new", requested_status="late", size_cap=3) == "bench"


def test_non_seat_requests_are_never_benched():
    for status in ("tentative", "declined"):
        assert seat_status_for(_seated(3), discord_user_id="new", requested_status=status, size_cap=3) == status


def test_seat_holder_switching_confirmed_late_keeps_seat():
    signups = _seated(3)
    assert seat_status_for(signups, discord_user_id="seat1", requested_status="late", size_cap=3) == "late"


def test_benched_player_stays_benched_while_full():
    signups = _seated(3) + [_signup(status="bench", discord_user_id="b1")]
    assert seat_status_for(signups, discord_user_id="b1", requested_status="confirmed", size_cap=3) == "bench"


def test_pick_promotions_fifo_into_open_seats():
    signups = _seated(1) + [
        _signup(status="bench", discord_user_id="late_bench", signed_up_at=_BASE_TS + timedelta(hours=2)),
        _signup(status="bench", discord_user_id="early_bench", signed_up_at=_BASE_TS + timedelta(hours=1)),
        _signup(status="bench", discord_user_id="last_bench", signed_up_at=_BASE_TS + timedelta(hours=3)),
    ]
    promoted = pick_promotions(signups, size_cap=3)
    assert [s.discord_user_id for s in promoted] == ["early_bench", "late_bench"]


def test_pick_promotions_none_when_full():
    signups = _seated(3) + [_signup(status="bench", discord_user_id="b1")]
    assert pick_promotions(signups, size_cap=3) == []
