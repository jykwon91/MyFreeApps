"""``GET /monthly-expenses/category``: the payments behind one heading.

Exactly the rows ``GET /monthly-expenses`` counts under that heading, so the
payments here always add up to its total.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.monthly_expenses.monthly_expense_payee_response import MonthlyExpensePayeeResponse
from app.schemas.monthly_expenses.monthly_expense_transaction_response import MonthlyExpenseTransactionResponse


class MonthlyExpenseCategoryDetailResponse(BaseModel):
    range: str
    scope: str
    label: str
    currency: str
    total_cents: int
    # Who got the most first.
    payees: list[MonthlyExpensePayeeResponse]
    # Newest first.
    transactions: list[MonthlyExpenseTransactionResponse]
