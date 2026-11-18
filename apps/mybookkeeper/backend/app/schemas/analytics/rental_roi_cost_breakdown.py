from pydantic import BaseModel

from app.schemas.analytics.rental_roi_cost_line import RentalRoiCostLine


class RentalRoiCostBreakdown(BaseModel):
    """What break-even is made of, per month."""

    debt_service_monthly_cents: int
    operating_monthly_cents: int
    mortgage_lines: list[RentalRoiCostLine]
    operating_lines: list[RentalRoiCostLine]
    # Bills the loan's escrow already pays: shown as left out, never added to break-even.
    escrow_covered_lines: list[RentalRoiCostLine]
