"""Raid dates a week (or N days) on, and a repeat's rules — ``raid_repeat``, pure: every ``now`` is passed in.

A slot keeps its wall-clock time across DST changes.  A time the
spring-forward gap skips lands an hour later without dragging the next
slot; in the repeated fall-back hour the first one counts.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_series import WowRaidSeries
from app.repositories.wow.wow_raid_event_repo import COPIED
from app.services.wow import raid_repeat

NY = "America/New_York"
_8PM = time(20, 0)

# Never carried to a copy: where and when it is, its post, who made it, its state, its Discord event and thread, attendance.
_NOT_COPIED = {
    "id", "guild_id", "starts_at", "status", "channel_id", "message_id", "created_by_user_id",
    "created_by_display_name", "cancel_reason", "closed_at", "close_reason", "deadline_applied_at", "start_applied_at",
    "last_pinged_at", "series_id", "created_at", "updated_at", "discord_event_id", "discord_event_digest", "thread_id",
} | {"discord_event_starts_at", "discord_event_claimed_at", "discord_event_error", "thread_name", "thread_error"} | {"attendance_counted", "attendance_recorded_at"} | {"unsigned_pinged_at"}
_NOT_COPIED |= {"pinned_message_id", "post_deleted_at", "web_id"}  # the bot's pin; when it deleted the post; page


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


# ---------------------------------------------------------------------------
# Repeats
# ---------------------------------------------------------------------------


def _series(every_days: int = 7, ahead: int | None = None) -> WowRaidSeries:
    """A repeat at 8pm in New York, its next raid Tuesday 13 October."""
    return WowRaidSeries(
        every_days=every_days,
        post_ahead_hours=ahead,
        next_starts_at=_utc(2026, 10, 14, 0, 0),
        start_local=_8PM,
        tz_name=NY,
    )


def test_a_raid_posts_ahead_or_when_the_one_before_starts() -> None:
    assert raid_repeat.post_at(_series()) == _utc(2026, 10, 7, 0, 0)
    assert raid_repeat.post_at(_series(ahead=48)) == _utc(2026, 10, 12, 0, 0)
    assert raid_repeat.ahead_hours(_series(every_days=3)) == 72


def test_never_further_ahead_than_the_interval() -> None:
    assert raid_repeat.ahead_choices(14) == raid_repeat.AHEADS
    assert raid_repeat.ahead_choices(7) == (None, 24, 48, 72, 168)
    assert raid_repeat.ahead_choices(3) == (None, 24, 48, 72)
    # Daily: two weeks ahead is impossible, and so is anything past a day.
    assert raid_repeat.ahead_choices(1) == (None, 24)
    assert not raid_repeat.ahead_fits(336, 1)
    assert raid_repeat.ahead_fits(24, 1)
    assert raid_repeat.ahead_fits(None, 1)


def test_a_raid_posted_with_sign_ups_closed_is_a_conflict() -> None:
    assert raid_repeat.ahead_conflict(48, 2880)  # equal counts: closed as it posts
    assert not raid_repeat.ahead_conflict(49, 2880)
    assert not raid_repeat.ahead_conflict(1, None)
    starts = _utc(2026, 10, 14, 0, 0)
    assert raid_repeat.closed_by_then(starts, 120, _utc(2026, 10, 13, 22, 0))
    assert not raid_repeat.closed_by_then(starts, 120, _utc(2026, 10, 13, 21, 59))
    assert not raid_repeat.closed_by_then(starts, None, starts)


def test_a_new_interval_goes_on_from_the_slot_before_the_next_one() -> None:
    friday = _utc(2026, 10, 2, 12, 0)
    # The slot before Tuesday 13 October is Tuesday 6 October.
    assert raid_repeat.rebase(_series(), 3, friday) == _utc(2026, 10, 10, 0, 0)  # Friday 9 October
    assert raid_repeat.rebase(_series(), 14, friday) == _utc(2026, 10, 21, 0, 0)
    # Asked later, the slots that passed meanwhile are skipped.
    assert raid_repeat.rebase(_series(), 3, _utc(2026, 10, 20, 12, 0)) == _utc(2026, 10, 22, 0, 0)


@pytest.mark.parametrize(("typed", "days"), [("7", 7), (" 10 ", 10), ("01", 1), ("28", 28)])
def test_a_typed_number_of_days(typed: str, days: int) -> None:
    assert raid_repeat.parse_every(typed) == days


@pytest.mark.parametrize(
    ("typed", "kind"),
    [("", "format"), ("two", "format"), ("7d", "format"), ("-1", "format"), ("\uff11", "format"),
     ("100", "format"), ("0", "range"), ("29", "range")],
)
def test_a_typed_number_of_days_that_wont_do(typed: str, kind: str) -> None:
    with pytest.raises(raid_repeat.RepeatError) as refused:
        raid_repeat.parse_every(typed)
    assert refused.value.kind == kind


def test_repeat_words() -> None:
    assert [raid_repeat.every_words(days) for days in (1, 3, 7, 10, 14, 21)] == [
        "every day", "every 3 days", "every week", "every 10 days", "every 2 weeks", "every 3 weeks"
    ]
    assert [raid_repeat.ahead_words(hours) for hours in (None, 24, 36, 168, 336)] == [
        "when the one before starts", "1 day before", "1 day 12 hours before", "1 week before", "2 weeks before"
    ]
    tuesday = _utc(2026, 10, 14, 0, 0)  # Tuesday 13 October, 8pm EDT
    assert raid_repeat.slot_words(tuesday, NY) == "Tue, Oct 13 8:00pm"
    assert raid_repeat.slot_words(_utc(2026, 10, 13, 16, 5), NY) == "Tue, Oct 13 12:05pm"
    assert raid_repeat.slot_words(_utc(2026, 10, 14, 4, 30), NY) == "Wed, Oct 14 12:30am"
    assert raid_repeat.skip_label(tuesday, NY) == "Skip Tue, Oct 13"
