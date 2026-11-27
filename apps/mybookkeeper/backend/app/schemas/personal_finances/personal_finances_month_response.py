"""Money in and out in one calendar month, as the personal finances page counts it."""
from __future__ import annotations

from pydantic import BaseModel


class PersonalFinancesMonthResponse(BaseModel):
    # "YYYY-MM".
    month: str
    # Pay, other money in and rent net of the rentals' costs (which can be
    # below zero in a month a rental cost more than it brought in).
    income_cents: int
    # Spending other than the rentals' costs, mortgage and loan payments included.
    expenses_cents: int
    # The part of expenses that paid a mortgage or a loan.
    mortgages_loans_cents: int
    # income - expenses.
    net_cents: int
