"""A category's budget from a month onward, as saved."""
from __future__ import annotations

import uuid

from pydantic import BaseModel


class SpendingBudgetResponse(BaseModel):
    spending_category_id: uuid.UUID
    # "YYYY-MM".
    effective_month: str
    # None: no budget from this month on.
    amount_cents: int | None
