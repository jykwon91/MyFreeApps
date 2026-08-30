"""Pure period arithmetic for rent schedules.

A schedule's periods tile forward from ``start_date`` with no separate anchor
day: period 0 begins on ``start_date``, and each subsequent period begins where
the previous one ended. A lease starting on the 15th therefore bills 15th→14th,
which is how leases actually read, and it removes any need to prorate a partial
*first* period.

The only period that can be short is the last one, when the schedule's
``end_date`` falls inside it. That tail is prorated by actual elapsed days over
the days the full period would have run — actual days, not the 30-day
convention used by ``inquiry_rent_proration``, because here both boundaries of
the period are known exactly and a real denominator is available.

Everything in this module is a pure function of its arguments: no DB, no clock.
"""
from __future__ import annotations

import calendar
import datetime as _dt
from decimal import Decimal, ROUND_HALF_UP

from app.core.rent_ledger_enums import RENT_CADENCE_DAYS, RENT_CADENCES

_CENTS = Decimal("0.01")


def add_months(start: _dt.date, months: int) -> _dt.date:
    """``start`` advanced by ``months``, clamping the day to the target month.

    Clamping matters for month-end starts: a schedule beginning Jan 31 yields
    Feb 28 (or 29), Mar 31, Apr 30 — the day never drifts permanently downward
    because every step is computed from the original ``start``, not from the
    previously clamped result.
    """
    total = start.month - 1 + months
    year = start.year + total // 12
    month = total % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return _dt.date(year, month, day)


def period_start(schedule_start: _dt.date, cadence: str, index: int) -> _dt.date:
    """First day of period ``index`` (0-based) for a schedule."""
    if cadence not in RENT_CADENCES:
        raise ValueError(f"unknown cadence: {cadence!r}")
    if index < 0:
        raise ValueError("period index must be >= 0")
    if cadence == "monthly":
        return add_months(schedule_start, index)
    return schedule_start + _dt.timedelta(days=RENT_CADENCE_DAYS[cadence] * index)


def period_bounds(
    schedule_start: _dt.date, cadence: str, index: int,
) -> tuple[_dt.date, _dt.date]:
    """``(period_start, period_end)`` for period ``index``, end **inclusive**.

    The end is the day before the next period begins, so consecutive periods
    tile with no gap and no overlap.
    """
    begin = period_start(schedule_start, cadence, index)
    nxt = period_start(schedule_start, cadence, index + 1)
    return begin, nxt - _dt.timedelta(days=1)


def period_index_for(
    schedule_start: _dt.date, cadence: str, on: _dt.date,
) -> int | None:
    """Index of the period containing ``on``, or ``None`` if before the start.

    Walks forward for monthly (calendar months vary in length, so there is no
    closed form that clamping preserves) and divides for the fixed-length
    cadences.
    """
    if on < schedule_start:
        return None
    if cadence != "monthly":
        span = RENT_CADENCE_DAYS[cadence]
        return (on - schedule_start).days // span

    # Month-count estimate, then correct by at most one step in either
    # direction — day-clamping can put the true period one off the estimate.
    guess = (on.year - schedule_start.year) * 12 + (on.month - schedule_start.month)
    guess = max(0, guess)
    while guess > 0 and period_start(schedule_start, cadence, guess) > on:
        guess -= 1
    while period_start(schedule_start, cadence, guess + 1) <= on:
        guess += 1
    return guess


def periods_through(
    schedule_start: _dt.date,
    cadence: str,
    through: _dt.date,
    end_date: _dt.date | None = None,
) -> list[tuple[int, _dt.date, _dt.date]]:
    """Every ``(index, start, end)`` whose period has *begun* on or before ``through``.

    A period counts as begun once ``through`` reaches its first day — rent for
    the current period is owed from day one, so the current period is always
    included. Periods are truncated at ``end_date`` when the schedule ends
    inside one, and no period is emitted that begins after ``end_date``.
    """
    horizon = through if end_date is None else min(through, end_date)
    if horizon < schedule_start:
        return []

    last_index = period_index_for(schedule_start, cadence, horizon)
    if last_index is None:
        return []

    out: list[tuple[int, _dt.date, _dt.date]] = []
    for index in range(last_index + 1):
        begin, finish = period_bounds(schedule_start, cadence, index)
        if end_date is not None and finish > end_date:
            finish = end_date
        out.append((index, begin, finish))
    return out


def prorated_amount(
    full_amount: Decimal,
    period_begin: _dt.date,
    period_finish: _dt.date,
    schedule_start: _dt.date,
    cadence: str,
    index: int,
) -> Decimal:
    """``full_amount`` scaled to a period truncated by the schedule's end date.

    Returns ``full_amount`` unchanged for whole periods. For a truncated tail,
    scales by ``actual_days / full_days`` and rounds half-up to the cent.
    """
    _, natural_finish = period_bounds(schedule_start, cadence, index)
    if period_finish >= natural_finish:
        return full_amount.quantize(_CENTS, rounding=ROUND_HALF_UP)

    full_days = (natural_finish - period_begin).days + 1
    actual_days = (period_finish - period_begin).days + 1
    if full_days <= 0 or actual_days <= 0:
        return Decimal("0.00")
    scaled = full_amount * Decimal(actual_days) / Decimal(full_days)
    return scaled.quantize(_CENTS, rounding=ROUND_HALF_UP)
