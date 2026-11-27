"""A credit card idea's offer terms."""
from pydantic import BaseModel


class SavingsCardDetailsResponse(BaseModel):
    sign_up_bonus: str | None = None
    minimum_spend_dollars: int | None = None
    spend_window_months: int | None = None
    annual_fee_dollars: int | None = None
    first_year_value_dollars: int | None = None
    credit_impact: str | None = None
