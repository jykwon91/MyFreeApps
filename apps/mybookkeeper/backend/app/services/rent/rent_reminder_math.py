"""Pure date and amount arithmetic for rent reminders. No DB, no clock.

**Amount.** A reminder quotes the rent charge covering its due date:

- ``monthly`` plans remind for the whole charge, on the charge's own due date
  (the period's first day — the 1st, or a mid-month move-in day).
- ``weekly`` plans split the charge evenly across the occurrences of the due
  weekday inside the charge's period: $1,500 for October 2026 (Sundays 4, 11,
  18, 25) is $375 a Sunday; November (1, 8, 15, 22, 29) is $300. Each share is
  rounded *down* to the cent and the remainder goes on the period's last
  occurrence, so the shares always sum to the charge exactly. A weekly
  *schedule* has one occurrence per period, so its reminder is just that
  week's charge.

**Projection.** Reminders go out *before* the period they announce has begun
(Saturday for Sunday Nov 1; Oct 29 for a Nov 1 monthly due date), so the
charge row does not exist yet — and must not be created early, or the ledger
would show the tenant owing a period that has not started. The period is
instead projected with ``rent_period_math.billed_periods``, the same function
the ledger's charge generator writes from, so the quoted amount is exactly what
will later be charged, prorated at either end of the tenancy.

Waived periods and zero-rent periods produce no reminder.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal
from zoneinfo import ZoneInfo

from app.core.rent_reminder_constants import (
    NEXT_DUE_SEARCH_DAYS,
    SEND_WINDOW_END,
    SEND_WINDOW_START,
)
from app.services.rent import rent_period_math as period_math

_CENTS = Decimal("0.01")


@dataclass(frozen=True)
class ScheduleTerms:
    """The parts of a ``rent_schedules`` row the projection reads."""

    id: uuid.UUID
    amount: Decimal
    cadence: str
    start_date: _dt.date
    end_date: _dt.date | None


@dataclass(frozen=True)
class PlanTerms:
    """The parts of a ``rent_reminder_plans`` row the timing logic reads."""

    frequency: str
    due_weekday: int | None
    send_days_before: int
    send_time: _dt.time
    timezone: str
    amount_override: Decimal | None


@dataclass(frozen=True)
class ProjectedPeriod:
    schedule_id: uuid.UUID
    period_start: _dt.date
    period_end: _dt.date
    amount: Decimal


@dataclass(frozen=True)
class DueReminder:
    due_date: _dt.date
    amount: Decimal
    period: ProjectedPeriod


def projected_periods(
    schedule: ScheduleTerms, window_start: _dt.date, window_end: _dt.date,
) -> list[ProjectedPeriod]:
    """Every period of ``schedule`` overlapping ``[window_start, window_end]``."""
    return [
        ProjectedPeriod(
            schedule_id=schedule.id,
            period_start=begin,
            period_end=finish,
            amount=amount,
        )
        for _index, begin, finish, amount in period_math.billed_periods(
            schedule.start_date, schedule.cadence, schedule.amount,
            window_end, schedule.end_date,
        )
        if finish >= window_start
    ]


def weekday_occurrences(
    begin: _dt.date, end: _dt.date, weekday: int,
) -> list[_dt.date]:
    """Every date in ``[begin, end]`` falling on ``weekday`` (0 = Monday)."""
    first = begin + _dt.timedelta(days=(weekday - begin.weekday()) % 7)
    out: list[_dt.date] = []
    day = first
    while day <= end:
        out.append(day)
        day += _dt.timedelta(days=7)
    return out


def split_evenly(total: Decimal, parts: int) -> list[Decimal]:
    """``total`` in ``parts`` cent-exact shares, any remainder on the last."""
    if parts <= 0:
        raise ValueError("parts must be positive")
    share = (total / parts).quantize(_CENTS, rounding=ROUND_DOWN)
    return [share] * (parts - 1) + [total - share * (parts - 1)]


def next_due(
    plan: PlanTerms,
    schedules: list[ScheduleTerms],
    *,
    from_date: _dt.date,
    skipped_periods: frozenset[tuple[uuid.UUID, _dt.date]] = frozenset(),
) -> DueReminder | None:
    """The earliest reminder due on or after ``from_date``.

    Due dates already in the past are never returned — a plan created (or a
    scheduler restarted) after a due date simply starts with the next one.
    ``skipped_periods`` holds ``(schedule_id, period_start)`` pairs that must
    not be reminded — waived charges.
    """
    horizon = from_date + _dt.timedelta(days=NEXT_DUE_SEARCH_DAYS)
    periods = sorted(
        (
            p
            for schedule in schedules
            for p in projected_periods(schedule, from_date, horizon)
        ),
        key=lambda p: p.period_start,
    )
    for period in periods:
        if period.amount <= 0 or (period.schedule_id, period.period_start) in skipped_periods:
            continue
        if plan.frequency == "monthly":
            if period.period_start >= from_date:
                return _with_override(plan, period.period_start, period.amount, period)
            continue
        if plan.due_weekday is None:
            return None
        occurrences = weekday_occurrences(
            period.period_start, period.period_end, plan.due_weekday,
        )
        upcoming = [d for d in occurrences if d >= from_date]
        if not upcoming:
            continue
        due = upcoming[0]
        shares = split_evenly(period.amount, len(occurrences))
        return _with_override(plan, due, shares[occurrences.index(due)], period)
    return None


def _with_override(
    plan: PlanTerms, due: _dt.date, computed: Decimal, period: ProjectedPeriod,
) -> DueReminder:
    amount = plan.amount_override if plan.amount_override is not None else computed
    return DueReminder(due_date=due, amount=amount, period=period)


def local_now(plan: PlanTerms, now: _dt.datetime) -> _dt.datetime:
    """``now`` (timezone-aware) in the plan's local timezone."""
    return now.astimezone(ZoneInfo(plan.timezone))


def send_at(plan: PlanTerms, due_date: _dt.date) -> _dt.datetime:
    """The local moment the reminder for ``due_date`` becomes sendable."""
    send_day = due_date - _dt.timedelta(days=plan.send_days_before)
    return _dt.datetime.combine(send_day, plan.send_time, tzinfo=ZoneInfo(plan.timezone))


def is_within_send_window(local: _dt.datetime) -> bool:
    return SEND_WINDOW_START <= local.time() < SEND_WINDOW_END


def is_due_to_send(plan: PlanTerms, due_date: _dt.date, now: _dt.datetime) -> bool:
    """Whether a scheduled tick at ``now`` should send the reminder for ``due_date``.

    True once the send moment has arrived, while the due date has not yet
    passed, and only inside the local daytime window.
    """
    local = local_now(plan, now)
    return (
        local.date() <= due_date
        and local >= send_at(plan, due_date)
        and is_within_send_window(local)
    )
