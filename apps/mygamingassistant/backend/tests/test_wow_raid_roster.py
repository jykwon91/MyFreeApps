"""Unit tests for app.services.wow.raid_roster.compute_roster_summary.

Pure-Python: no DB, no fixtures, no async.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_roster import RoleCounts, RosterSummary, compute_roster_summary


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
    assert summary.confirmed_count == 2
    assert summary.role_counts.healer == 2


def test_tentative_counts_toward_cap():
    signups = [_signup(status="tentative", role="dps") for _ in range(5)]
    summary = compute_roster_summary(signups, size_cap=25)
    assert summary.confirmed_count == 5
    assert summary.role_counts.dps == 5


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
    assert summary.confirmed_count == 26  # 3+5+17+1
    assert summary.bench_count == 4
    assert summary.declined_count == 2
    assert summary.is_full is True
    assert summary.role_counts.total == 26
