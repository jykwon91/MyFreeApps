"""A month on average over the range's full months."""
from __future__ import annotations

from pydantic import BaseModel


class PersonalFinancesAverageResponse(BaseModel):
    # How many months the average is over: the range, less this month while
    # it is still going (unless it is the only month).
    months: int
    income_cents: int
    expenses_cents: int
    net_cents: int
    # The same with one-offs left out of money in: a typical month.
    typical_income_cents: int
    typical_net_cents: int
