"""Rent-reminder amount, due-date and send-window arithmetic.

Pure functions only — no database, no clock. The driving case is Sonu:
$1,500 a month on a monthly schedule, paying every Sunday, reminded the
Saturday before at 6pm America/Chicago.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest

from app.services.rent import rent_reminder_math as math
from app.services.rent import rent_reminder_message as message

SCHEDULE_ID = uuid.uuid4()
SUNDAY = 6
UTC = _dt.timezone.utc


def _schedule(
    *,
    amount: str = "1500.00",
    cadence: str = "monthly",
    start: _dt.date = _dt.date(2026, 1, 1),
    end: _dt.date | None = None,
) -> math.ScheduleTerms:
    return math.ScheduleTerms(
        id=SCHEDULE_ID, amount=Decimal(amount), cadence=cadence,
        start_date=start, end_date=end,
    )


def _weekly(
    *, override: str | None = None, send_days_before: int = 1,
) -> math.PlanTerms:
    return math.PlanTerms(
        frequency="weekly",
        due_weekday=SUNDAY,
        send_days_before=send_days_before,
        send_time=_dt.time(18, 0),
        timezone="America/Chicago",
        amount_override=Decimal(override) if override else None,
    )


def _monthly(*, send_days_before: int = 3) -> math.PlanTerms:
    return math.PlanTerms(
        frequency="monthly",
        due_weekday=None,
        send_days_before=send_days_before,
        send_time=_dt.time(18, 0),
        timezone="America/Chicago",
        amount_override=None,
    )


def _due(plan, schedules, on: _dt.date, **kwargs) -> math.DueReminder | None:
    return math.next_due(plan, schedules, from_date=on, **kwargs)


class TestWeeklySplit:
    def test_october_2026_has_four_sundays_so_375_each(self) -> None:
        due = _due(_weekly(), [_schedule()], _dt.date(2026, 10, 15))
        assert due is not None
        assert due.due_date == _dt.date(2026, 10, 18)
        assert due.amount == Decimal("375.00")

    def test_november_2026_has_five_sundays_so_300_each(self) -> None:
        due = _due(_weekly(), [_schedule()], _dt.date(2026, 10, 26))
        assert due is not None
        assert due.due_date == _dt.date(2026, 11, 1)
        assert due.amount == Decimal("300.00")
        assert due.period.period_start == _dt.date(2026, 11, 1)

    def test_due_today_is_still_upcoming(self) -> None:
        due = _due(_weekly(), [_schedule()], _dt.date(2026, 10, 25))
        assert due is not None
        assert due.due_date == _dt.date(2026, 10, 25)

    def test_remainder_goes_on_the_last_occurrence(self) -> None:
        schedules = [_schedule(amount="1000.01")]
        firsts = [
            _due(_weekly(), schedules, d).amount
            for d in (_dt.date(2026, 10, 4), _dt.date(2026, 10, 11), _dt.date(2026, 10, 18))
        ]
        last = _due(_weekly(), schedules, _dt.date(2026, 10, 25)).amount
        assert firsts == [Decimal("250.00")] * 3
        assert last == Decimal("250.01")
        assert sum(firsts) + last == Decimal("1000.01")

    def test_split_evenly_sums_exactly(self) -> None:
        assert math.split_evenly(Decimal("1000.00"), 3) == [
            Decimal("333.33"), Decimal("333.33"), Decimal("333.34"),
        ]

    def test_prorated_move_in_month_divides_the_prorated_charge(self) -> None:
        # Move-in Oct 15: Oct 15-31 is 17/31 of $1,500 = $822.58, over the two
        # Sundays left in the period (Oct 18, Oct 25).
        schedules = [_schedule(start=_dt.date(2026, 10, 15))]
        first = _due(_weekly(), schedules, _dt.date(2026, 10, 15))
        second = _due(_weekly(), schedules, _dt.date(2026, 10, 19))
        assert first.period.amount == Decimal("822.58")
        assert (first.due_date, first.amount) == (_dt.date(2026, 10, 18), Decimal("411.29"))
        assert (second.due_date, second.amount) == (_dt.date(2026, 10, 25), Decimal("411.29"))

    def test_lease_ending_mid_month_prorates_its_last_month(self) -> None:
        # Ends Nov 15: Nov 1-15 is 15/30 of $1,500 = $750, over Sundays 1, 8, 15.
        schedules = [_schedule(end=_dt.date(2026, 11, 15))]
        due = _due(_weekly(), schedules, _dt.date(2026, 10, 26))
        assert due.period.amount == Decimal("750.00")
        assert due.amount == Decimal("250.00")
        assert _due(_weekly(), schedules, _dt.date(2026, 11, 16)) is None

    def test_weekly_schedule_reminds_for_that_weeks_charge(self) -> None:
        schedules = [
            _schedule(amount="375.00", cadence="weekly", start=_dt.date(2026, 10, 4)),
        ]
        due = _due(_weekly(), schedules, _dt.date(2026, 10, 12))
        assert due.due_date == _dt.date(2026, 10, 18)
        assert due.amount == Decimal("375.00")

    def test_override_wins(self) -> None:
        due = _due(_weekly(override="400.00"), [_schedule()], _dt.date(2026, 10, 26))
        assert due.amount == Decimal("400.00")

    def test_waived_period_is_skipped(self) -> None:
        skipped = frozenset({(SCHEDULE_ID, _dt.date(2026, 11, 1))})
        due = _due(_weekly(), [_schedule()], _dt.date(2026, 10, 26), skipped_periods=skipped)
        assert due.due_date == _dt.date(2026, 12, 6)

    def test_no_schedule_means_no_reminder(self) -> None:
        assert _due(_weekly(), [], _dt.date(2026, 10, 26)) is None


class TestMonthly:
    def test_monthly_payer_reminded_for_the_whole_month(self) -> None:
        due = _due(_monthly(), [_schedule()], _dt.date(2026, 10, 2))
        assert due.due_date == _dt.date(2026, 11, 1)
        assert due.amount == Decimal("1500.00")

    def test_prorated_move_in_reminds_on_its_own_due_date(self) -> None:
        schedules = [_schedule(start=_dt.date(2026, 10, 15))]
        first = _due(_monthly(), schedules, _dt.date(2026, 10, 10))
        assert (first.due_date, first.amount) == (_dt.date(2026, 10, 15), Decimal("822.58"))
        then = _due(_monthly(), schedules, _dt.date(2026, 10, 16))
        assert (then.due_date, then.amount) == (_dt.date(2026, 11, 1), Decimal("1500.00"))

    def test_plan_created_after_a_due_date_does_not_back_remind(self) -> None:
        # Created Oct 19: Oct 18 is gone, the next reminder is Oct 25.
        due = _due(_weekly(), [_schedule()], _dt.date(2026, 10, 19))
        assert due.due_date == _dt.date(2026, 10, 25)


def _chicago(y: int, m: int, d: int, hh: int, mm: int = 0) -> _dt.datetime:
    from zoneinfo import ZoneInfo

    return _dt.datetime(y, m, d, hh, mm, tzinfo=ZoneInfo("America/Chicago"))


class TestSendWindow:
    def test_monthly_nov_1_goes_out_oct_29_at_6pm(self) -> None:
        plan = _monthly()
        due = _dt.date(2026, 11, 1)
        assert math.send_at(plan, due) == _chicago(2026, 10, 29, 18)
        assert not math.is_due_to_send(plan, due, _chicago(2026, 10, 29, 17, 59))
        assert math.is_due_to_send(plan, due, _chicago(2026, 10, 29, 18))
        # Given in UTC, still 6pm Chicago (CDT, UTC-5).
        assert math.is_due_to_send(plan, due, _dt.datetime(2026, 10, 29, 23, 0, tzinfo=UTC))

    def test_saturday_before_sunday_across_dst_end(self) -> None:
        # Nov 1 2026 is the day US DST ends; Saturday 6pm is still CDT.
        plan = _weekly()
        assert math.send_at(plan, _dt.date(2026, 11, 1)) == _chicago(2026, 10, 31, 18)
        assert math.is_due_to_send(
            plan, _dt.date(2026, 11, 1), _dt.datetime(2026, 10, 31, 23, 5, tzinfo=UTC),
        )

    def test_never_outside_daytime_window(self) -> None:
        plan = _weekly()
        due = _dt.date(2026, 11, 1)
        assert not math.is_due_to_send(plan, due, _chicago(2026, 10, 31, 20, 0))
        assert not math.is_due_to_send(plan, due, _chicago(2026, 11, 1, 8, 59))
        # Missed Saturday evening (worker down)? It catches up next morning.
        assert math.is_due_to_send(plan, due, _chicago(2026, 11, 1, 9, 0))

    def test_never_for_a_past_due_date(self) -> None:
        assert not math.is_due_to_send(
            _weekly(), _dt.date(2026, 11, 1), _chicago(2026, 11, 2, 10),
        )


class TestMessage:
    @pytest.mark.parametrize(
        ("sent_on", "phrase"),
        [
            (_dt.date(2026, 10, 31), "tomorrow (Sunday)"),
            (_dt.date(2026, 11, 1), "today (Sunday)"),
            (_dt.date(2026, 10, 29), "on Sunday, Nov 1"),
        ],
    )
    def test_due_phrase(self, sent_on: _dt.date, phrase: str) -> None:
        assert message.due_phrase(_dt.date(2026, 11, 1), sent_on) == phrase

    def test_sonus_reminder(self) -> None:
        text = message.render_reminder(
            tenant_legal_name="Sonu Patel",
            amount=Decimal("375.00"),
            due_date=_dt.date(2026, 10, 18),
            sent_on=_dt.date(2026, 10, 17),
            payment_instructions="Zelle to jason@example.com",
        )
        assert text == (
            "Hi Sonu, reminder: rent of $375 is due tomorrow (Sunday). "
            "Pay via Zelle to jason@example.com."
        )

    def test_cents_and_thousands(self) -> None:
        assert message.format_amount(Decimal("411.29")) == "$411.29"
        assert message.format_amount(Decimal("1500.00")) == "$1,500"
