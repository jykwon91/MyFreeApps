"""Everything the monthly expenses page counts over a range."""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass

from app.services.monthly_expenses.counted_expense import CountedExpense


@dataclass(frozen=True)
class CountedExpenses:
    # The first of each full month in the range, oldest first.
    months: list[_dt.date]
    expenses: list[CountedExpense]
    # See ``cash_basis.bank_history_start``.
    bank_history_start: _dt.date | None
