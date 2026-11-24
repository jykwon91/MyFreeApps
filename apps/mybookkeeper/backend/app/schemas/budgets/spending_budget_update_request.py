"""``PUT /budgets/{spending_category_id}``: set a category's monthly budget from a month on."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.core.budget_constants import BUDGET_AMOUNT_MAX_CENTS
from app.core.month_text import parse_month


class SpendingBudgetUpdateRequest(BaseModel):
    # "YYYY-MM": the budget holds from this month until the category's next change.
    effective_month: str
    # None removes the budget from this month on.
    amount_cents: int | None = Field(ge=0, le=BUDGET_AMOUNT_MAX_CENTS)

    @field_validator("effective_month")
    @classmethod
    def _check_month(cls, value: str) -> str:
        parse_month(value)
        return value
