"""Rental ROI: mortgage rows in, response schemas out.

Money is rounded to cents exactly once, here, half-up — truncating would
understate every target by up to a cent per figure.
"""
import uuid
from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal

from app.core.rental_roi_enums import GAP_BASIS_BREAK_EVEN, GAP_BASIS_TARGET
from app.models.mortgage.mortgage import Mortgage
from app.schemas.analytics.rental_roi_cost_breakdown import RentalRoiCostBreakdown
from app.schemas.analytics.rental_roi_property import RentalRoiProperty
from app.schemas.analytics.rental_roi_summary import RentalRoiSummary
from app.services.analytics.rental_roi_figures import RentalRoiFigures
from app.services.analytics.rental_roi_loan import RentalRoiLoan

_HUNDRED = Decimal(100)
_WHOLE = Decimal(1)


def to_cents(dollars: Decimal) -> int:
    return int((dollars * _HUNDRED).quantize(_WHOLE, rounding=ROUND_HALF_UP))


def _optional_cents(dollars: Decimal | None) -> int | None:
    return None if dollars is None else to_cents(dollars)


def loan_from_mortgage(mortgage: Mortgage) -> RentalRoiLoan:
    return RentalRoiLoan(
        monthly_principal_cents=mortgage.monthly_principal_cents,
        monthly_interest_cents=mortgage.monthly_interest_cents,
        monthly_escrow_cents=mortgage.monthly_escrow_cents,
        original_principal_cents=mortgage.original_principal_cents,
    )


def to_property_response(
    property_id: uuid.UUID, property_name: str, figures: RentalRoiFigures,
) -> RentalRoiProperty:
    return RentalRoiProperty(
        property_id=property_id,
        property_name=property_name,
        months_averaged=figures.months_averaged,
        has_purchase_price=figures.has_purchase_price,
        mortgage_source=figures.mortgage_source,
        break_even_monthly_cents=to_cents(figures.break_even_monthly),
        target_monthly_cents=_optional_cents(figures.target_monthly),
        actual_revenue_monthly_cents=to_cents(figures.actual_revenue_monthly),
        gap_monthly_cents=to_cents(figures.gap_monthly),
        gap_basis=figures.gap_basis,
        cash_invested_cents=_optional_cents(figures.cash_invested),
        noi_annual_cents=to_cents(figures.noi_annual),
        cap_rate_pct=figures.cap_rate_pct,
        cash_on_cash_pct=figures.cash_on_cash_pct,
        cost_breakdown=RentalRoiCostBreakdown(
            debt_service_monthly_cents=to_cents(figures.debt_service_monthly),
            operating_monthly_cents=to_cents(figures.operating_monthly),
        ),
    )


def to_summary(properties: Sequence[RentalRoiProperty]) -> RentalRoiSummary:
    """Totals of the rounded rows, so the total row always adds up on screen.

    The gap is measured against the target total only when every property
    has a target; otherwise against break-even, and ``gap_basis`` says so.
    """
    total_break_even = sum(p.break_even_monthly_cents for p in properties)
    targets = [p.target_monthly_cents for p in properties if p.target_monthly_cents is not None]
    total_target = sum(targets)
    total_actual = sum(p.actual_revenue_monthly_cents for p in properties)
    every_property_has_target = bool(properties) and len(targets) == len(properties)
    return RentalRoiSummary(
        property_count=len(properties),
        properties_with_target=len(targets),
        total_break_even_monthly_cents=total_break_even,
        total_target_monthly_cents=total_target,
        total_actual_revenue_monthly_cents=total_actual,
        total_gap_monthly_cents=total_actual - (total_target if every_property_has_target else total_break_even),
        gap_basis=GAP_BASIS_TARGET if every_property_has_target else GAP_BASIS_BREAK_EVEN,
    )
