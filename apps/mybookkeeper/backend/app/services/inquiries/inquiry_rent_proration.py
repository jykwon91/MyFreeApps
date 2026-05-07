"""Pure helpers for prorating a listing's monthly rent against an inquiry's
move-in / move-out dates.

A listing's ``monthly_rate`` is the headline price the host advertises. An
inquiry that doesn't span exactly one or more whole months — and especially
short stays — needs the rent stretched or shrunk to the actual duration.
Hosts asked us to display the prorated estimate alongside the inquiry so
they can sanity-check pricing during triage.

Convention: a ``month`` is treated as 30 days for proration. This is the
standard rental industry convention for short-term and partial-month
prorating; using actual-month length (28-31 days) would make two equally
priced 7-day stays look different depending on which month they fall in,
which the host would find confusing.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal, ROUND_HALF_UP

DAYS_PER_MONTH: int = 30


def stay_duration_days(
    move_in_date: _dt.date | None,
    move_out_date: _dt.date | None,
) -> int | None:
    """Return ``(move_out - move_in).days`` when both are set, else ``None``."""
    if move_in_date is None or move_out_date is None:
        return None
    return (move_out_date - move_in_date).days


def estimated_total_rent(
    *,
    monthly_rate: Decimal | None,
    move_in_date: _dt.date | None,
    move_out_date: _dt.date | None,
) -> Decimal | None:
    """Prorated total rent for the stay.

    Formula: ``monthly_rate * duration_days / 30`` rounded to the nearest cent.

    Returns ``None`` when any input is missing — callers decide how to render
    the missing case (typically "(not set)" or just hiding the line).
    """
    if monthly_rate is None:
        return None
    duration = stay_duration_days(move_in_date, move_out_date)
    if duration is None or duration <= 0:
        return None
    raw = monthly_rate * Decimal(duration) / Decimal(DAYS_PER_MONTH)
    return raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
