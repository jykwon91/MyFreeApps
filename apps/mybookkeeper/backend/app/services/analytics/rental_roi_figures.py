"""One property's Rental ROI figures, in Decimal dollars before rounding to cents."""
from dataclasses import dataclass
from decimal import Decimal

from app.services.analytics.rental_roi_cost_line import RentalRoiCostLine


@dataclass(frozen=True)
class RentalRoiFigures:
    months_averaged: int
    mortgage_source: str
    has_purchase_price: bool
    debt_service_monthly: Decimal
    operating_monthly: Decimal
    break_even_monthly: Decimal
    target_monthly: Decimal | None
    actual_revenue_monthly: Decimal
    gap_monthly: Decimal
    gap_basis: str
    cash_invested: Decimal | None
    noi_annual: Decimal
    cap_rate_pct: Decimal | None
    cash_on_cash_pct: Decimal | None
    mortgage_lines: tuple[RentalRoiCostLine, ...]
    operating_lines: tuple[RentalRoiCostLine, ...]
    # Bills the loan's escrow already pays, so they are not part of break-even.
    escrow_covered_lines: tuple[RentalRoiCostLine, ...]
