from pydantic import BaseModel


class RentalRoiCostLine(BaseModel):
    """One category's share of break-even, per month."""

    category: str
    monthly_cents: int
    # Null when the amount comes from a loan record rather than an average of transactions.
    window_total_cents: int | None
