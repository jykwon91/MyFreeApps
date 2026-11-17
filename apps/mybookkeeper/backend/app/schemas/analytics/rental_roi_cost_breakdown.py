from pydantic import BaseModel


class RentalRoiCostBreakdown(BaseModel):
    """What break-even is made of, per month."""

    debt_service_monthly_cents: int
    operating_monthly_cents: int
