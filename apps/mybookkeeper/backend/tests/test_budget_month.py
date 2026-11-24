"""Budget vs actual for one month, as a pure function.

Pinned: refunds filed to a category come off its spending (and can take it
below zero); money in with no category is income and never shows; uncategorized
expenses are their own line; the latest budget row on or before the month is
the one in effect and a None row means no budget; percent is whole and rounded
half up; archived categories appear only for months they were live in or that
still have money filed to them; totals cover every personal expense.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.models.budgets.spending_budget import SpendingBudget
from app.models.transactions.spending_category import SpendingCategory
from app.services.budgets import budget_month

MARCH = _dt.date(2026, 3, 1)
ORG = uuid.uuid4()


def _category(name: str, *, archived_at: _dt.datetime | None = None) -> SpendingCategory:
    return SpendingCategory(
        id=uuid.uuid4(), organization_id=ORG, name=name, is_default=False, archived_at=archived_at,
    )


def _budget(category: SpendingCategory, month: _dt.date, cents: int | None) -> SpendingBudget:
    return SpendingBudget(
        id=uuid.uuid4(), organization_id=ORG, spending_category_id=category.id,
        effective_month=month, amount_cents=cents,
    )


def test_a_refund_comes_off_its_category_spending() -> None:
    groceries = _category("Groceries")
    result = budget_month.build_month(
        month=MARCH,
        categories=[groceries],
        budget_rows=[_budget(groceries, MARCH, 400_00)],
        totals=[(groceries.id, "expense", Decimal("250.00")), (groceries.id, "income", Decimal("30.50"))],
    )
    [line] = result.lines
    assert (line.spent_cents, line.refunded_cents) == (219_50, 30_50)
    assert line.remaining_cents == 180_50
    assert line.percent_used == 55
    assert not line.is_over_budget


def test_refunds_larger_than_purchases_are_shown_below_zero() -> None:
    shopping = _category("Shopping")
    result = budget_month.build_month(
        month=MARCH, categories=[shopping], budget_rows=[_budget(shopping, MARCH, 100_00)],
        totals=[(shopping.id, "income", Decimal("40"))],
    )
    [line] = result.lines
    assert line.spent_cents == -40_00
    assert line.percent_used == 0
    assert line.remaining_cents == 140_00


def test_money_in_with_no_category_is_income_not_a_refund() -> None:
    result = budget_month.build_month(
        month=MARCH, categories=[], budget_rows=[],
        totals=[(None, "income", Decimal("3000")), (None, "expense", Decimal("12.34"))],
    )
    assert result.uncategorized_spent_cents == 12_34
    assert result.totals.spent_cents == 12_34


def test_the_latest_budget_on_or_before_the_month_is_in_effect() -> None:
    dining = _category("Dining")
    rows = [_budget(dining, _dt.date(2026, 1, 1), 200_00), _budget(dining, _dt.date(2026, 2, 1), 300_00)]
    [line] = budget_month.build_month(month=MARCH, categories=[dining], budget_rows=rows, totals=[]).lines
    assert (line.budget_cents, line.budget_effective_month) == (300_00, "2026-02")


def test_a_removed_budget_means_no_budget() -> None:
    dining = _category("Dining")
    rows = [_budget(dining, _dt.date(2026, 1, 1), 200_00), _budget(dining, _dt.date(2026, 2, 1), None)]
    result = budget_month.build_month(
        month=MARCH, categories=[dining], budget_rows=rows, totals=[(dining.id, "expense", Decimal("50"))],
    )
    [line] = result.lines
    assert line.budget_cents is None
    assert line.budget_effective_month is None
    assert (line.remaining_cents, line.percent_used, line.is_over_budget) == (None, None, False)
    assert result.totals.budgeted_cents is None


def test_over_budget_and_percent_rounding() -> None:
    gas = _category("Gas")
    [line] = budget_month.build_month(
        month=MARCH, categories=[gas], budget_rows=[_budget(gas, MARCH, 300_00)],
        totals=[(gas.id, "expense", Decimal("301.50"))],
    ).lines
    assert line.is_over_budget
    assert line.percent_used == 101
    assert line.remaining_cents == -1_50
    assert budget_month.percent_used(1, 200) == 1  # half a percent rounds up
    assert budget_month.percent_used(50, 0) is None


def test_archived_categories_show_only_while_relevant() -> None:
    utc = _dt.timezone.utc
    archived_in_march = _category("Gym", archived_at=_dt.datetime(2026, 3, 15, tzinfo=utc))
    archived_long_ago = _category("Old hobby", archived_at=_dt.datetime(2025, 6, 1, tzinfo=utc))
    archived_with_spend = _category("Pet", archived_at=_dt.datetime(2025, 6, 1, tzinfo=utc))
    result = budget_month.build_month(
        month=MARCH,
        categories=[archived_in_march, archived_long_ago, archived_with_spend],
        budget_rows=[],
        totals=[(archived_with_spend.id, "expense", Decimal("9"))],
    )
    assert [line.name for line in result.lines] == ["Gym", "Pet"]
    assert all(line.is_archived for line in result.lines)


def test_totals_add_every_budget_and_every_personal_expense() -> None:
    groceries, dining, gas = _category("Groceries"), _category("Dining"), _category("Gas")
    result = budget_month.build_month(
        month=MARCH,
        categories=[groceries, dining, gas],
        budget_rows=[_budget(groceries, MARCH, 400_00), _budget(dining, MARCH, 100_00)],
        totals=[
            (groceries.id, "expense", Decimal("100")),
            (gas.id, "expense", Decimal("60")),
            (None, "expense", Decimal("40")),
        ],
    )
    totals = result.totals
    assert (totals.budgeted_cents, totals.spent_cents, totals.remaining_cents) == (500_00, 200_00, 300_00)
    assert totals.percent_used == 40
    assert not totals.is_over_budget
    assert result.month == "2026-03"
