"""Pure period arithmetic for rent schedules.

Monthly schedules bill on **calendar months**: rent is due on the 1st, and a
tenant who moves in mid-month owes a prorated first period covering only the
days they were there. A schedule starting Aug 15 therefore produces

    Aug 15 – Aug 31   prorated (17 of August's 31 days)
    Sep 1  – Sep 30   full
    Oct 1  – Oct 31   full

which is how rent is normally billed and collected. A schedule starting on the
1st is the ordinary case of the same rule, with nothing to prorate.

Weekly and biweekly schedules tile from ``start_date`` instead — a tenant who
pays every Friday is billed Friday to Thursday, and there is no calendar
boundary to align to.

Either end of a period can be short:

- the **first** period, when the schedule starts after the month begins;
- the **last** period, when ``end_date`` falls inside it;
- both at once, for a schedule that starts and ends inside one month.

All three are the same computation — actual days over the days the whole
period would have run. Actual days, not the 30-day convention used by
``inquiry_rent_proration``, because here both boundaries of the period are
known exactly and a real denominator is available. (That module prices
hypothetical stays, where a fixed 30 keeps two equal-length stays priced
equally; this one bills a real month someone actually lived in.)

Everything in this module is a pure function of its arguments: no DB, no clock.
"""
from __future__ import annotations

import calendar
import datetime as _dt
from decimal import Decimal, ROUND_HALF_UP

from app.core.rent_ledger_enums import RENT_CADENCE_DAYS, RENT_CADENCES

_CENTS = Decimal("0.01")


def month_first(start: _dt.date, months: int) -> _dt.date:
    """The 1st of the month ``months`` after ``start``'s month."""
    total = start.month - 1 + months
    year = start.year + total // 12
    month = total % 12 + 1
    return _dt.date(year, month, 1)


def month_last(day: _dt.date) -> _dt.date:
    """The last day of ``day``'s month."""
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def natural_bounds(
    schedule_start: _dt.date, cadence: str, index: int,
) -> tuple[_dt.date, _dt.date]:
    """The whole period ``index`` occupies, ignoring where the schedule sits.

    This is the denominator of proration: the period as it would run if the
    tenant were there for all of it. For monthly that is the calendar month;
    for the fixed-length cadences it is a full span from ``start_date``.
    """
    if cadence not in RENT_CADENCES:
        raise ValueError(f"unknown cadence: {cadence!r}")
    if index < 0:
        raise ValueError("period index must be >= 0")
    if cadence == "monthly":
        begin = month_first(schedule_start, index)
        return begin, month_last(begin)
    span = RENT_CADENCE_DAYS[cadence]
    begin = schedule_start + _dt.timedelta(days=span * index)
    return begin, begin + _dt.timedelta(days=span - 1)


def period_bounds(
    schedule_start: _dt.date, cadence: str, index: int,
) -> tuple[_dt.date, _dt.date]:
    """``(start, end)`` of period ``index`` as billed, end **inclusive**.

    Identical to :func:`natural_bounds` except that period 0 of a monthly
    schedule is clipped to the day the schedule actually starts. Consecutive
    periods tile with no gap and no overlap.
    """
    begin, finish = natural_bounds(schedule_start, cadence, index)
    # Only monthly period 0 can open before the schedule does.
    return max(begin, schedule_start), finish


def period_start(schedule_start: _dt.date, cadence: str, index: int) -> _dt.date:
    """First billed day of period ``index`` (0-based)."""
    return period_bounds(schedule_start, cadence, index)[0]


def period_index_for(
    schedule_start: _dt.date, cadence: str, on: _dt.date,
) -> int | None:
    """Index of the period containing ``on``, or ``None`` if before the start.

    Monthly periods are calendar months, so the index is just the month
    distance — no clamping correction, unlike anniversary-day tiling.
    """
    if on < schedule_start:
        return None
    if cadence != "monthly":
        return (on - schedule_start).days // RENT_CADENCE_DAYS[cadence]
    return (on.year - schedule_start.year) * 12 + (on.month - schedule_start.month)


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
    """``full_amount`` scaled to the days actually billed in this period.

    Returns ``full_amount`` unchanged for a whole period. A period short at
    either end — a mid-month move-in, a mid-month move-out, or both inside one
    month — is scaled by ``billed_days / whole_days`` and rounded half-up to
    the cent.
    """
    natural_begin, natural_finish = natural_bounds(schedule_start, cadence, index)
    whole_days = (natural_finish - natural_begin).days + 1
    billed_days = (period_finish - period_begin).days + 1
    if whole_days <= 0 or billed_days <= 0:
        return Decimal("0.00")
    if billed_days >= whole_days:
        return full_amount.quantize(_CENTS, rounding=ROUND_HALF_UP)
    scaled = full_amount * Decimal(billed_days) / Decimal(whole_days)
    return scaled.quantize(_CENTS, rounding=ROUND_HALF_UP)
