"""One month's budget against actual spending. Pure.

How money counts (the repository has already kept only counted, personal,
non-transfer rows dated inside the month):

* A personal expense filed to a category is spending in that category.
* Personal money in filed to a category is a refund or credit: it comes off
  that category's spending. A month can end below zero when refunds outweigh
  purchases; it is shown as it is, never clamped.
* Personal money in with no category is income (a paycheck), never a refund,
  so it is not on this page at all.
* A personal expense with no category is the uncategorized line.

Which categories are listed: every live category, and an archived one for any
month it was live in (archived on or after the month began) or that still has
money filed to it.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterable, Sequence
from decimal import Decimal

from app.core.budget_constants import BUDGET_CURRENCY
from app.core.cents import to_cents
from app.core.month_text import format_month
from app.core.tags import TRANSACTION_TYPE_EXPENSE, TRANSACTION_TYPE_INCOME
from app.models.budgets.spending_budget import SpendingBudget
from app.models.transactions.spending_category import SpendingCategory
from app.repositories.budgets.personal_spending_repo import CategoryTotal
from app.schemas.budgets.budget_line_response import BudgetLineResponse
from app.schemas.budgets.budget_month_response import BudgetMonthResponse
from app.schemas.budgets.budget_totals_response import BudgetTotalsResponse

_ZERO = Decimal(0)


def budgets_in_effect(rows: Iterable[SpendingBudget]) -> dict[uuid.UUID, SpendingBudget]:
    """The latest row per category. ``rows`` are oldest first and none starts
    after the month asked about."""
    latest: dict[uuid.UUID, SpendingBudget] = {}
    for row in rows:
        latest[row.spending_category_id] = row
    return latest


def percent_used(spent_cents: int, budget_cents: int | None) -> int | None:
    """Whole percent, rounded half up; None with no budget or a zero one. Below
    zero spending is 0%."""
    if budget_cents is None or budget_cents == 0:
        return None
    spent = max(spent_cents, 0)
    return (spent * 200 + budget_cents) // (budget_cents * 2)


def _is_over(spent_cents: int, budget_cents: int | None) -> bool:
    return budget_cents is not None and spent_cents > budget_cents


def _was_live_during(category: SpendingCategory, month: _dt.date) -> bool:
    archived = category.archived_at
    return archived is None or archived.date() >= month


def _line(
    category: SpendingCategory,
    budget: SpendingBudget | None,
    expense: Decimal,
    refunded: Decimal,
) -> BudgetLineResponse:
    spent_cents = to_cents(expense - refunded)
    budget_cents = budget.amount_cents if budget is not None else None
    return BudgetLineResponse(
        spending_category_id=category.id,
        name=category.name,
        is_archived=category.archived_at is not None,
        budget_cents=budget_cents,
        budget_effective_month=(
            format_month(budget.effective_month)
            if budget is not None and budget_cents is not None
            else None
        ),
        spent_cents=spent_cents,
        refunded_cents=to_cents(refunded),
        remaining_cents=None if budget_cents is None else budget_cents - spent_cents,
        percent_used=percent_used(spent_cents, budget_cents),
        is_over_budget=_is_over(spent_cents, budget_cents),
    )


def _totals(lines: Sequence[BudgetLineResponse], uncategorized_cents: int) -> BudgetTotalsResponse:
    budgets = [line.budget_cents for line in lines if line.budget_cents is not None]
    budgeted = sum(budgets) if budgets else None
    spent = sum(line.spent_cents for line in lines) + uncategorized_cents
    return BudgetTotalsResponse(
        budgeted_cents=budgeted,
        spent_cents=spent,
        remaining_cents=None if budgeted is None else budgeted - spent,
        percent_used=percent_used(spent, budgeted),
        is_over_budget=_is_over(spent, budgeted),
    )


def build_month(
    *,
    month: _dt.date,
    categories: Sequence[SpendingCategory],
    budget_rows: Iterable[SpendingBudget],
    totals: Iterable[CategoryTotal],
) -> BudgetMonthResponse:
    """``categories`` in display order (live first), ``budget_rows`` every row
    starting on or before ``month``, ``totals`` the month's personal money per
    (category, type)."""
    expenses: dict[uuid.UUID, Decimal] = {}
    refunds: dict[uuid.UUID, Decimal] = {}
    uncategorized = _ZERO
    known = {category.id for category in categories}
    for category_id, kind, total in totals:
        if category_id is None or category_id not in known:
            # Money in with no category is income, not a refund.
            if kind == TRANSACTION_TYPE_EXPENSE:
                uncategorized += total
        elif kind == TRANSACTION_TYPE_EXPENSE:
            expenses[category_id] = expenses.get(category_id, _ZERO) + total
        elif kind == TRANSACTION_TYPE_INCOME:
            refunds[category_id] = refunds.get(category_id, _ZERO) + total

    in_effect = budgets_in_effect(budget_rows)
    lines = [
        _line(category, in_effect.get(category.id), expenses.get(category.id, _ZERO), refunds.get(category.id, _ZERO))
        for category in categories
        if _was_live_during(category, month) or category.id in expenses or category.id in refunds
    ]
    uncategorized_cents = to_cents(uncategorized)
    return BudgetMonthResponse(
        month=format_month(month),
        currency=BUDGET_CURRENCY,
        lines=lines,
        uncategorized_spent_cents=uncategorized_cents,
        totals=_totals(lines, uncategorized_cents),
    )
