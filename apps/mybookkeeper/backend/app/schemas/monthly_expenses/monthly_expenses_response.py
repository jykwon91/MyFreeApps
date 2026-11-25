"""``GET /monthly-expenses``: the average month of spending across every account."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.monthly_expenses.monthly_expense_category_response import MonthlyExpenseCategoryResponse
from app.schemas.monthly_expenses.monthly_expense_month_response import MonthlyExpenseMonthResponse


class MonthlyExpensesResponse(BaseModel):
    # One of ``MONTHLY_EXPENSE_RANGES``.
    range: str
    # One of ``CASH_FLOW_SCOPES``.
    scope: str
    currency: str
    # Every full month averaged, oldest first, empty months included.
    months: list[MonthlyExpenseMonthResponse]
    total_cents: int
    average_cents: int
    # Largest first.
    categories: list[MonthlyExpenseCategoryResponse]
