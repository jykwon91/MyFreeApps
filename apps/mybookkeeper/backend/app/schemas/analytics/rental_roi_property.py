import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.analytics.rental_roi_cost_breakdown import RentalRoiCostBreakdown


class RentalRoiProperty(BaseModel):
    property_id: uuid.UUID
    property_name: str
    # A home the owner lives in that also collects rent: all of its costs are counted.
    is_personal_home: bool
    months_averaged: int
    has_purchase_price: bool
    mortgage_source: Literal["records", "transactions", "none"]
    break_even_monthly_cents: int
    # Null without a purchase price: the return is a share of the cash put in.
    target_monthly_cents: int | None
    actual_revenue_monthly_cents: int
    gap_monthly_cents: int
    gap_basis: Literal["target", "break_even"]
    cash_invested_cents: int | None
    noi_annual_cents: int
    cap_rate_pct: Decimal | None
    cash_on_cash_pct: Decimal | None
    cost_breakdown: RentalRoiCostBreakdown
