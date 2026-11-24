"""The month's budgets added up against all personal spending."""
from __future__ import annotations

from pydantic import BaseModel


class BudgetTotalsResponse(BaseModel):
    # Every listed category's budget; None when no category has one.
    budgeted_cents: int | None
    # All personal spending this month, uncategorized and unbudgeted included.
    spent_cents: int
    remaining_cents: int | None
    percent_used: int | None
    is_over_budget: bool
