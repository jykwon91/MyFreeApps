"""Find subscriptions and bills in a year of charges. Pure; no I/O.

A merchant is recurring when enough of its charges sit near one typical
amount (``RECURRING_AMOUNT_TOLERANCE`` of the median) and the median gap
between them matches a cadence in ``RECURRING_CADENCES``. One that stopped
charging (no charge within two of its periods) is left out: a cancelled
subscription isn't one to cancel.
"""
from __future__ import annotations

import datetime as _dt
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal
from statistics import median

from app.core.savings_constants import (
    RECURRING_AMOUNT_TOLERANCE,
    RECURRING_ANNUAL_MIN_CHARGES,
    RECURRING_CADENCES,
    RECURRING_MIN_CHARGES,
    SUMMARY_MERCHANT_MAX_LENGTH,
    SUMMARY_TOP_RECURRING,
)
from app.repositories.savings.savings_spending_repo import MerchantChargeRow
from app.schemas.savings.savings_recurring_charge import SavingsRecurringCharge

_ANNUAL_PER_YEAR = 1
# A merchant still charging has charged within this many of its periods.
_ACTIVE_PERIODS = 2


def _cadence_for(gap_days: float) -> tuple[str, int, int, int] | None:
    for cadence in RECURRING_CADENCES:
        _, low, high, _ = cadence
        if low <= gap_days <= high:
            return cadence
    return None


def _detect_one(
    merchant: str, charges: list[tuple[_dt.date, Decimal]], as_of: _dt.date,
) -> SavingsRecurringCharge | None:
    typical = median(amount for _, amount in charges)
    if typical <= 0:
        return None
    tolerance = typical * Decimal(str(RECURRING_AMOUNT_TOLERANCE))
    steady = sorted(
        (day, amount) for day, amount in charges if abs(amount - typical) <= tolerance
    )
    if len(steady) < RECURRING_ANNUAL_MIN_CHARGES:
        return None
    gaps = [(later[0] - earlier[0]).days for earlier, later in zip(steady, steady[1:])]
    cadence = _cadence_for(median(gaps))
    if cadence is None:
        return None
    name, _, longest_gap, per_year = cadence
    needed = RECURRING_ANNUAL_MIN_CHARGES if per_year == _ANNUAL_PER_YEAR else RECURRING_MIN_CHARGES
    last_charged_on = steady[-1][0]
    if len(steady) < needed or (as_of - last_charged_on).days > longest_gap * _ACTIVE_PERIODS:
        return None
    steady_typical = median(amount for _, amount in steady)
    return SavingsRecurringCharge(
        merchant=merchant[:SUMMARY_MERCHANT_MAX_LENGTH],
        cadence=name,
        typical_charge_dollars=float(round(steady_typical, 2)),
        yearly_cost_dollars=int(round(steady_typical * per_year)),
        charges_in_window=len(steady),
        last_charged_on=last_charged_on,
    )


def detect_recurring_charges(
    rows: Iterable[MerchantChargeRow], *, as_of: _dt.date,
) -> list[SavingsRecurringCharge]:
    """Recurring merchants, costliest per year first, at most ``SUMMARY_TOP_RECURRING``."""
    by_merchant: dict[str, list[tuple[_dt.date, Decimal]]] = defaultdict(list)
    display: dict[str, str] = {}
    for merchant, day, amount in rows:
        key = merchant.strip().casefold()
        if not key:
            continue
        display.setdefault(key, merchant.strip())
        by_merchant[key].append((day, amount))
    found = [
        charge
        for key, charges in by_merchant.items()
        if (charge := _detect_one(display[key], charges, as_of)) is not None
    ]
    found.sort(key=lambda charge: charge.yearly_cost_dollars, reverse=True)
    return found[:SUMMARY_TOP_RECURRING]
