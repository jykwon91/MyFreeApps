"""One line of the breakdown: what a kind of spending costs a month."""
from __future__ import annotations

from pydantic import BaseModel


class MonthlyExpenseCategoryResponse(BaseModel):
    label: str
    # Over every month in the range.
    total_cents: int
    # ``total_cents`` spread over the months in the range.
    average_cents: int
    # Of everything spent in the range, to one decimal place.
    share_percent: float
