"""Pure arithmetic for the Rental ROI analytics.

Every amount is Decimal dollars; nothing here rounds money (the mapper rounds
to cents once, at the edge). Percentages are rounded to two places.
"""
from collections.abc import Iterable, Mapping, Sequence
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.core.rental_roi_enums import (
    GAP_BASIS_BREAK_EVEN,
    GAP_BASIS_TARGET,
    LOAN_LINE_ESCROW,
    LOAN_LINE_INTEREST,
    LOAN_LINE_PRINCIPAL,
    MORTGAGE_SOURCE_NONE,
    MORTGAGE_SOURCE_RECORDS,
    MORTGAGE_SOURCE_TRANSACTIONS,
    WINDOW_MONTHS,
)
from app.core.tags import (
    RENTAL_ROI_DEBT_SERVICE_TAGS,
    RENTAL_ROI_ESCROW_COVERED_TAGS,
    RENTAL_ROI_OPERATING_TAGS,
    RENTAL_ROI_REVENUE_TAGS,
)
from app.services.analytics.rental_roi_cost_line import RentalRoiCostLine
from app.services.analytics.rental_roi_figures import RentalRoiFigures
from app.services.analytics.rental_roi_loan import RentalRoiLoan

_ZERO = Decimal(0)
_HUNDRED = Decimal(100)
_MONTHS_PER_YEAR = Decimal(12)
_PCT_QUANTUM = Decimal("0.01")


def _first_of_month_offset(month_start: date, months: int) -> date:
    years, month_index = divmod(month_start.month - 1 + months, 12)
    return date(month_start.year + years, month_index + 1, 1)


def trailing_window(today: date) -> tuple[date, date]:
    """The last ``WINDOW_MONTHS`` full calendar months before ``today``'s month."""
    this_month = today.replace(day=1)
    return _first_of_month_offset(this_month, -WINDOW_MONTHS), this_month - timedelta(days=1)


def rental_start(rented_since: date | None, placed_in_service: date | None) -> date | None:
    """When a property began renting: the day the owner says, else when it was placed in service."""
    return rented_since or placed_in_service


def counting_from(window_start: date, rented_from: date | None) -> date:
    """The first month of the window that counts: the month renting began, or the window's start."""
    if rented_from is None:
        return window_start
    return max(window_start, rented_from.replace(day=1))


def months_in_service(window_start: date, window_end: date, rented_from: date | None) -> int:
    """Months of the window the property was renting — the divisor for every average.

    Unknown start means the whole window. Always at least one, so a property
    that started renting this month still divides by something.
    """
    start = counting_from(window_start, rented_from)
    months = (window_end.year - start.year) * 12 + window_end.month - start.month + 1
    return min(WINDOW_MONTHS, max(1, months))


def _cents_to_dollars(cents: int | None) -> Decimal:
    return Decimal(cents or 0) / _HUNDRED


def _sum_tags(totals: Mapping[str, Decimal], tags: Iterable[str]) -> Decimal:
    return sum((totals.get(tag, _ZERO) for tag in tags), _ZERO)


def collects_rent(category_totals: Mapping[str, Decimal]) -> bool:
    """Whether a property earned rental revenue, whatever its tax classification."""
    return _sum_tags(category_totals, RENTAL_ROI_REVENUE_TAGS) > 0


def _category_lines(
    totals: Mapping[str, Decimal], tags: Iterable[str], divisor: Decimal,
) -> tuple[RentalRoiCostLine, ...]:
    """The tags that have an amount, biggest first, then by name so the order is stable."""
    amounts = [(tag, totals[tag]) for tag in tags if totals.get(tag, _ZERO) != _ZERO]
    return tuple(
        RentalRoiCostLine(category=tag, monthly=amount / divisor, window_total=amount)
        for tag, amount in sorted(amounts, key=lambda item: (-item[1], item[0]))
    )


def _loan_lines(loans: Sequence[RentalRoiLoan]) -> tuple[RentalRoiCostLine, ...]:
    """Principal, interest and escrow across the loans, leaving out any part that is zero."""
    parts = (
        (LOAN_LINE_PRINCIPAL, sum((_cents_to_dollars(loan.monthly_principal_cents) for loan in loans), _ZERO)),
        (LOAN_LINE_INTEREST, sum((_cents_to_dollars(loan.monthly_interest_cents) for loan in loans), _ZERO)),
        (LOAN_LINE_ESCROW, sum((_cents_to_dollars(loan.monthly_escrow_cents) for loan in loans), _ZERO)),
    )
    return tuple(
        RentalRoiCostLine(category=category, monthly=amount, window_total=None)
        for category, amount in parts
        if amount != _ZERO
    )


def _percentage(numerator: Decimal, denominator: Decimal | None) -> Decimal | None:
    if denominator is None or denominator <= 0:
        return None
    return (numerator / denominator * _HUNDRED).quantize(_PCT_QUANTUM, rounding=ROUND_HALF_UP)


def cash_invested(purchase_price: Decimal | None, loans: Sequence[RentalRoiLoan]) -> Decimal | None:
    """Purchase price less what was borrowed against it.

    Unknown when the price is unknown, when any loan's original amount is
    unknown or recorded as zero (a statement that omits it saves 0, and
    counting that would overstate the cash and inflate the target), or when
    the loans cover the whole price.
    """
    if purchase_price is None:
        return None
    if any((loan.original_principal_cents or 0) <= 0 for loan in loans):
        return None
    invested = purchase_price - sum(
        (_cents_to_dollars(loan.original_principal_cents) for loan in loans), _ZERO,
    )
    return invested if invested > 0 else None


def compute_property_figures(
    *,
    category_totals: Mapping[str, Decimal],
    months: int,
    loans: Sequence[RentalRoiLoan],
    purchase_price: Decimal | None,
    target_return_pct: Decimal,
) -> RentalRoiFigures:
    """What one rental costs to carry, needs to earn, and actually earns, per month.

    ``category_totals`` are the window's summed transaction amounts per
    category; ``loans`` are the property's loans still being paid.
    """
    divisor = Decimal(months)
    paying_loans = [loan for loan in loans if loan.has_payment]
    escrow_monthly = sum((_cents_to_dollars(loan.monthly_escrow_cents) for loan in paying_loans), _ZERO)

    if paying_loans:
        mortgage_source = MORTGAGE_SOURCE_RECORDS
        debt_service = sum(
            (
                _cents_to_dollars(loan.monthly_principal_cents)
                + _cents_to_dollars(loan.monthly_interest_cents)
                + _cents_to_dollars(loan.monthly_escrow_cents)
                for loan in paying_loans
            ),
            _ZERO,
        )
    else:
        debt_service_total = _sum_tags(category_totals, RENTAL_ROI_DEBT_SERVICE_TAGS)
        mortgage_source = MORTGAGE_SOURCE_TRANSACTIONS if debt_service_total > 0 else MORTGAGE_SOURCE_NONE
        debt_service = debt_service_total / divisor

    mortgage_lines = (
        _loan_lines(paying_loans)
        if paying_loans
        else _category_lines(category_totals, RENTAL_ROI_DEBT_SERVICE_TAGS, divisor)
    )
    escrow_covered_tags = RENTAL_ROI_ESCROW_COVERED_TAGS if escrow_monthly > 0 else frozenset[str]()
    operating_tags = RENTAL_ROI_OPERATING_TAGS - escrow_covered_tags
    operating = _sum_tags(category_totals, operating_tags) / divisor

    break_even = debt_service + operating
    invested = cash_invested(purchase_price, loans)
    target = (
        break_even + target_return_pct / _HUNDRED * invested / _MONTHS_PER_YEAR
        if invested is not None
        else None
    )
    actual = _sum_tags(category_totals, RENTAL_ROI_REVENUE_TAGS) / divisor
    gap_basis = GAP_BASIS_TARGET if target is not None else GAP_BASIS_BREAK_EVEN
    gap = actual - (target if target is not None else break_even)
    noi_annual = (actual - operating - escrow_monthly) * _MONTHS_PER_YEAR

    return RentalRoiFigures(
        months_averaged=months,
        mortgage_source=mortgage_source,
        has_purchase_price=purchase_price is not None,
        debt_service_monthly=debt_service,
        operating_monthly=operating,
        break_even_monthly=break_even,
        target_monthly=target,
        actual_revenue_monthly=actual,
        gap_monthly=gap,
        gap_basis=gap_basis,
        cash_invested=invested,
        noi_annual=noi_annual,
        cap_rate_pct=_percentage(noi_annual, purchase_price),
        cash_on_cash_pct=_percentage((actual - break_even) * _MONTHS_PER_YEAR, invested),
        mortgage_lines=mortgage_lines,
        operating_lines=_category_lines(category_totals, operating_tags, divisor),
        escrow_covered_lines=_category_lines(category_totals, escrow_covered_tags, divisor),
    )
