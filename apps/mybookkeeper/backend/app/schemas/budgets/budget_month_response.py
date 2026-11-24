"""``GET /budgets``: one month's budget against actual spending."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.budgets.budget_line_response import BudgetLineResponse
from app.schemas.budgets.budget_totals_response import BudgetTotalsResponse


class BudgetMonthResponse(BaseModel):
    # "YYYY-MM".
    month: str
    currency: str
    # Live categories, then archived ones, alphabetical within each.
    lines: list[BudgetLineResponse]
    # Personal expenses with no spending category this month.
    uncategorized_spent_cents: int
    totals: BudgetTotalsResponse
