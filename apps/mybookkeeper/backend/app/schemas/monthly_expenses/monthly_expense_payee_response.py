"""Everything one payee got under a heading over the range."""
from __future__ import annotations

from pydantic import BaseModel


class MonthlyExpensePayeeResponse(BaseModel):
    payee: str
    total_cents: int
    transaction_count: int
