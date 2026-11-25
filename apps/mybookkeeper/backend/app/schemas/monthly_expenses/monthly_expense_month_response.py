"""What was spent in one full calendar month."""
from __future__ import annotations

from pydantic import BaseModel


class MonthlyExpenseMonthResponse(BaseModel):
    # "YYYY-MM".
    month: str
    total_cents: int
