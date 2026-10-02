"""Raid dates a week (or N days) on — ``raid_repeat``, pure: every ``now`` is passed in.

A slot keeps its wall-clock time across DST changes.  A time the
spring-forward gap skips lands an hour later without dragging the next
slot; in the repeated fall-back hour the first one counts.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow.wow_raid_event_repo import COPIED
from app.services.wow import raid_repeat

NY = "America/New_York"
_8PM = time(20, 0)

# Never carried to a copy: where and when it is, its post, who made it, its state.
_NOT_COPIED = {
    "id", "guild_id", "starts_at", "status", "channel_id", "message_id", "created_by_user_id",
    "created_by_display_name", "cancel_reason", "closed_at", "close_reason", "deadline_applied_at",
    "start_applied_at", "last_pinged_at", "created_at", "updated_at",
}


def _utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("day", "clock", "expected"),
    [
        (date(2026, 10, 27), _8PM, _utc(2026, 10, 28, 0, 0)),  # Tuesday 8pm EDT
        (date(2026, 11, 3), _8PM, _utc(2026, 11, 4, 1, 0)),  # the Tuesday after the clocks go back: 8pm EST
        (date(2027, 3, 14), time(2, 30), _utc(2027, 3, 14, 7, 30)),  # 2:30 is skipped: 3:30 EDT
        (date(2026, 11, 1), time(1, 30), _utc(2026, 11, 1, 5, 30)),  # 1:30 happens twice: the first, EDT
    ],
)
def test_a_slot_is_its_day_at_the_wall_clock_time(day: date, clock: time, expected: datetime) -> None:
    assert raid_repeat.slot_at(day, clock, NY) == expected


def test_a_week_on_keeps_8pm_across_the_clocks_going_back() -> None:
    tuesday = raid_repeat.slot_at(date(2026, 10, 27), _8PM, NY)
    assert raid_repeat.following(tuesday, 7, _8PM, NY) == _utc(2026, 11, 4, 1, 0)
    assert raid_repeat.local_clock(_utc(2026, 11, 4, 1, 0), NY) == _8PM


def test_a_skipped_time_does_not_drag_the_next_slot() -> None:
    skipped = raid_repeat.slot_at(date(2027, 3, 14), time(2, 30), NY)
    assert raid_repeat.following(skipped, 7, time(2, 30), NY) == _utc(2027, 3, 21, 6, 30)  # 2:30 EDT again


def test_first_after_is_the_next_slot_to_come() -> None:
    tuesday = _utc(2026, 9, 2, 0, 0)  # Tuesday 1 September, 8pm EDT
    friday = _utc(2026, 10, 2, 12, 0)
    # The slots between have passed and are skipped: the Tuesday after.
    assert raid_repeat.first_after(tuesday, 7, _8PM, NY, friday) == _utc(2026, 10, 7, 0, 0)
    # Every 3 days: 1 October has passed by Friday morning, so 4 October.
    assert raid_repeat.first_after(tuesday, 3, _8PM, NY, friday) == _utc(2026, 10, 5, 0, 0)
    # Never the anchor's own slot, however early it's asked.
    assert raid_repeat.first_after(tuesday, 7, _8PM, NY, _utc(2026, 8, 1, 0, 0)) == _utc(2026, 9, 9, 0, 0)


def test_first_after_on_the_day_itself() -> None:
    tuesday = _utc(2026, 9, 30, 0, 0)  # Tuesday 29 September, 8pm EDT
    morning, night = _utc(2026, 10, 6, 14, 0), _utc(2026, 10, 7, 1, 0)  # 10am and 9pm on 6 October
    assert raid_repeat.first_after(tuesday, 7, _8PM, NY, morning) == _utc(2026, 10, 7, 0, 0)
    assert raid_repeat.first_after(tuesday, 7, _8PM, NY, night) == _utc(2026, 10, 14, 0, 0)
    # A slot at this very moment has passed.
    assert raid_repeat.first_after(tuesday, 7, _8PM, NY, _utc(2026, 10, 7, 0, 0)) == _utc(2026, 10, 14, 0, 0)


def test_copy_suggestion_is_a_week_on_rolled_into_the_future() -> None:
    # A raid still to come: a week on, at 8pm across the clocks going back.
    assert raid_repeat.copy_suggestion(_utc(2026, 10, 28, 0, 0), NY, _utc(2026, 10, 20, 12, 0)) == _utc(
        2026, 11, 4, 1, 0
    )
    # An old raid: its weekday to come, at its time.
    assert raid_repeat.copy_suggestion(_utc(2026, 9, 2, 0, 0), NY, _utc(2026, 10, 2, 12, 0)) == _utc(2026, 10, 7, 0, 0)


def test_every_raid_column_is_copied_or_left_behind_on_purpose() -> None:
    columns = set(WowRaidEvent.__table__.columns.keys())
    assert set(COPIED) | _NOT_COPIED == columns
    assert not set(COPIED) & _NOT_COPIED
