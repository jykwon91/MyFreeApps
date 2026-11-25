"""A row that counts as spending, and the heading it counts under."""
from __future__ import annotations

from dataclasses import dataclass

from app.repositories.monthly_expenses.expense_row import ExpenseRow


@dataclass(frozen=True)
class CountedExpense:
    row: ExpenseRow
    label: str
