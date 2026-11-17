from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.analytics.rental_roi_property import RentalRoiProperty
from app.schemas.analytics.rental_roi_summary import RentalRoiSummary


class RentalRoiResponse(BaseModel):
    window_start: date
    window_end: date
    target_return_pct: Decimal
    # Any approved transaction in the window, tied to a property or not.
    has_transactions: bool
    # Revenue with no property, averaged over the window's months.
    unassigned_revenue_monthly_cents: int
    summary: RentalRoiSummary
    properties: list[RentalRoiProperty]
