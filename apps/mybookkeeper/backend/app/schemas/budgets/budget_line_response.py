"""One personal spending category's budget against what was spent, for a month."""
from __future__ import annotations

import uuid

from pydantic import BaseModel


class BudgetLineResponse(BaseModel):
    spending_category_id: uuid.UUID
    name: str
    # Archived categories are listed for the months they were live in, or
    # when something was still filed to them; they can't be budgeted again.
    is_archived: bool
    # The budget in effect this month; None when there is none.
    budget_cents: int | None
    # "YYYY-MM" the budget in effect started; None with no budget.
    budget_effective_month: str | None
    # Personal expenses filed to the category, less refunds filed to it.
    # Negative when refunds outweigh the month's purchases.
    spent_cents: int
    # The refunds (personal money in filed to the category) taken off above.
    refunded_cents: int
    # budget - spent; None with no budget. Negative when over budget.
    remaining_cents: int | None
    # Whole percent of the budget spent; None with no budget or a zero one.
    percent_used: int | None
    is_over_budget: bool
