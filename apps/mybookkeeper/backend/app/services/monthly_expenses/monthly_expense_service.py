"""Monthly expenses: the average full month of spending across every account,
and the payments behind each heading.

Both come from ``_counted``, so a heading's payments always add up to its
total. Orchestration only — the queries are in ``monthly_expense_repo``, the
rules in ``bank_twins`` / ``expense_rules``, the sums in
``monthly_expense_breakdown`` and ``monthly_expense_detail``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.budget_constants import BUDGET_CURRENCY, CASH_FLOW_SCOPES, SCOPE_ALL
from app.core.month_text import month_end
from app.core.monthly_expense_constants import (
    BANK_TWIN_WINDOW_DAYS,
    CARD_PAYMENT_MATCH_WINDOW_DAYS,
    MONTHLY_EXPENSE_RANGE_MONTHS,
)
from app.db.session import unit_of_work
from app.repositories.monthly_expenses import monthly_expense_repo
from app.schemas.monthly_expenses.monthly_expense_category_detail_response import (
    MonthlyExpenseCategoryDetailResponse,
)
from app.schemas.monthly_expenses.monthly_expenses_response import MonthlyExpensesResponse
from app.services.monthly_expenses import (
    bank_twins,
    expense_rules,
    monthly_expense_breakdown,
    monthly_expense_detail,
)
from app.services.monthly_expenses.counted_expense import CountedExpense
from app.services.monthly_expenses.expense_context import ExpenseContext


class InvalidMonthlyExpenseRangeError(ValueError):
    pass


class InvalidMonthlyExpenseScopeError(ValueError):
    pass


async def _counted(
    *, organization_id: uuid.UUID, range_key: str, scope: str, today: _dt.date,
) -> tuple[list[_dt.date], list[CountedExpense]]:
    """The full months in the range, and every row in them that counts as
    spending, with its heading."""
    if range_key not in MONTHLY_EXPENSE_RANGE_MONTHS:
        raise InvalidMonthlyExpenseRangeError(range_key)
    if scope not in CASH_FLOW_SCOPES:
        raise InvalidMonthlyExpenseScopeError(scope)
    months = monthly_expense_breakdown.full_months(MONTHLY_EXPENSE_RANGE_MONTHS[range_key], today)
    first_day, last_day = months[0], month_end(months[-1])
    # A row at either edge can have its twin, or its card's side, just
    # outside the months shown.
    margin = _dt.timedelta(days=max(BANK_TWIN_WINDOW_DAYS, CARD_PAYMENT_MATCH_WINDOW_DAYS))
    start, end = first_day - margin, last_day + margin
    async with unit_of_work() as db:
        rows = await monthly_expense_repo.list_outflows(
            db,
            organization_id=organization_id,
            start=start,
            end=end,
            transaction_scope=None if scope == SCOPE_ALL else scope,
        )
        arrivals = await monthly_expense_repo.list_card_payment_arrivals(
            db, organization_id=organization_id, start=start, end=end,
        )
        mortgage_parts = await monthly_expense_repo.list_mortgage_payment_parts(
            db, organization_id=organization_id,
        )
        holder_names = await monthly_expense_repo.holder_names(
            db, user_ids={row.account_user_id for row in rows if row.account_user_id is not None},
        )

    rows = bank_twins.drop_bank_twins(rows)
    context = ExpenseContext(
        mortgage_payments=expense_rules.mortgage_payment_cents(mortgage_parts),
        card_payments=expense_rules.card_payment_ids(rows, arrivals),
        holder_names=holder_names,
    )
    counted: list[CountedExpense] = []
    for row in rows:
        if not first_day <= row.transaction_date <= last_day:
            continue
        label = expense_rules.expense_label(row, context)
        if label is not None:
            counted.append(CountedExpense(row=row, label=label))
    return months, counted


async def get_monthly_expenses(
    *, organization_id: uuid.UUID, range_key: str, scope: str, today: _dt.date,
) -> MonthlyExpensesResponse:
    months, counted = await _counted(
        organization_id=organization_id, range_key=range_key, scope=scope, today=today,
    )
    month_rows, categories, total_cents = monthly_expense_breakdown.build_breakdown(
        months, [(c.row.transaction_date, c.label, c.row.amount) for c in counted],
    )
    return MonthlyExpensesResponse(
        range=range_key,
        scope=scope,
        currency=BUDGET_CURRENCY,
        months=month_rows,
        total_cents=total_cents,
        average_cents=monthly_expense_breakdown.average_cents(total_cents, len(months)),
        categories=categories,
    )


async def get_category_detail(
    *, organization_id: uuid.UUID, range_key: str, scope: str, label: str, today: _dt.date,
) -> MonthlyExpenseCategoryDetailResponse:
    _, counted = await _counted(
        organization_id=organization_id, range_key=range_key, scope=scope, today=today,
    )
    transactions = monthly_expense_detail.transactions_for(counted, label)
    return MonthlyExpenseCategoryDetailResponse(
        range=range_key,
        scope=scope,
        label=label,
        currency=BUDGET_CURRENCY,
        total_cents=sum(t.amount_cents for t in transactions),
        payees=monthly_expense_detail.payee_totals(transactions),
        transactions=transactions,
    )
