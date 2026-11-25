"""Spending per month and per heading, averaged over full months. Pure."""
from __future__ import annotations

import datetime as _dt
from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal

from app.core.cents import to_cents
from app.core.month_text import add_months, format_month, month_start
from app.schemas.monthly_expenses.monthly_expense_category_response import MonthlyExpenseCategoryResponse
from app.schemas.monthly_expenses.monthly_expense_month_response import MonthlyExpenseMonthResponse

_ZERO = Decimal(0)
_WHOLE = Decimal(1)
_ONE_DECIMAL = Decimal("0.1")
_HUNDRED = Decimal(100)

# (day, heading, amount) of one row that counts as spending.
SpentRow = tuple[_dt.date, str, Decimal]


def full_months(count: int, today: _dt.date) -> list[_dt.date]:
    """The first of each of the ``count`` full months before this one, oldest first."""
    last = add_months(month_start(today), -1)
    return [add_months(last, offset) for offset in range(1 - count, 1)]


def average_cents(total_cents: int, month_count: int) -> int:
    return int((Decimal(total_cents) / month_count).quantize(_WHOLE, rounding=ROUND_HALF_UP))


def _share_percent(part_cents: int, total_cents: int) -> float:
    if total_cents == 0:
        return 0.0
    return float((Decimal(part_cents) * _HUNDRED / total_cents).quantize(_ONE_DECIMAL, rounding=ROUND_HALF_UP))


def build_breakdown(
    months: list[_dt.date], spent: Iterable[SpentRow],
) -> tuple[list[MonthlyExpenseMonthResponse], list[MonthlyExpenseCategoryResponse], int]:
    """Each month's total (empty ones as zero), each heading largest first,
    and the total. Rows outside ``months`` are ignored."""
    per_month = {month: _ZERO for month in months}
    per_label: dict[str, Decimal] = {}
    for day, label, amount in spent:
        month = month_start(day)
        if month not in per_month:
            continue
        per_month[month] += amount
        per_label[label] = per_label.get(label, _ZERO) + amount

    month_rows = [
        MonthlyExpenseMonthResponse(month=format_month(month), total_cents=to_cents(per_month[month]))
        for month in months
    ]
    total_cents = sum(row.total_cents for row in month_rows)
    label_cents = {label: to_cents(amount) for label, amount in per_label.items()}
    categories = [
        MonthlyExpenseCategoryResponse(
            label=label,
            total_cents=cents,
            average_cents=average_cents(cents, len(months)),
            share_percent=_share_percent(cents, total_cents),
        )
        for label, cents in sorted(label_cents.items(), key=lambda item: (-item[1], item[0]))
    ]
    return month_rows, categories, total_cents
