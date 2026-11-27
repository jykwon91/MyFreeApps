"""Monthly expenses: the average full month of spending across every account,
and the payments behind each heading.

Both come from ``_counted``, so a heading's payments always add up to its
total. Orchestration only — which rows count as spent, and under which
heading, is ``spending_ledger`` (the same rows Cash flow counts as money out);
the sums are in ``monthly_expense_breakdown`` and ``monthly_expense_detail``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.budget_constants import BUDGET_CURRENCY, CASH_FLOW_SCOPES, SCOPE_ALL
from app.core.month_text import month_end
from app.core.monthly_expense_constants import MONTHLY_EXPENSE_RANGE_MONTHS
from app.db.session import unit_of_work
from app.repositories.cash_flow import cash_basis
from app.schemas.monthly_expenses.monthly_expense_category_detail_response import (
    MonthlyExpenseCategoryDetailResponse,
)
from app.schemas.monthly_expenses.monthly_expenses_response import MonthlyExpensesResponse
from app.services.monthly_expenses import monthly_expense_breakdown, monthly_expense_detail, spending_ledger
from app.services.monthly_expenses.counted_expenses import CountedExpenses


class InvalidMonthlyExpenseRangeError(ValueError):
    pass


class InvalidMonthlyExpenseScopeError(ValueError):
    pass


async def _counted(
    *, organization_id: uuid.UUID, range_key: str, scope: str, today: _dt.date,
) -> CountedExpenses:
    """The full months in the range, every row in them that counts as
    spending, with its heading, and where the bank history starts."""
    if range_key not in MONTHLY_EXPENSE_RANGE_MONTHS:
        raise InvalidMonthlyExpenseRangeError(range_key)
    if scope not in CASH_FLOW_SCOPES:
        raise InvalidMonthlyExpenseScopeError(scope)
    months = monthly_expense_breakdown.full_months(MONTHLY_EXPENSE_RANGE_MONTHS[range_key], today)
    async with unit_of_work() as db:
        history_start = await cash_basis.bank_history_start(db, organization_id=organization_id)
        counted = await spending_ledger.counted_spending(
            db,
            organization_id=organization_id,
            first_day=months[0],
            last_day=month_end(months[-1]),
            transaction_scope=None if scope == SCOPE_ALL else scope,
            bank_history_start=history_start,
        )
    return CountedExpenses(months=months, expenses=counted, bank_history_start=history_start)


async def get_monthly_expenses(
    *, organization_id: uuid.UUID, range_key: str, scope: str, today: _dt.date,
) -> MonthlyExpensesResponse:
    counted = await _counted(
        organization_id=organization_id, range_key=range_key, scope=scope, today=today,
    )
    month_rows, categories, total_cents = monthly_expense_breakdown.build_breakdown(
        counted.months, [(c.row.transaction_date, c.label, c.row.amount) for c in counted.expenses],
    )
    return MonthlyExpensesResponse(
        range=range_key,
        scope=scope,
        currency=BUDGET_CURRENCY,
        bank_history_start=counted.bank_history_start,
        months=month_rows,
        total_cents=total_cents,
        average_cents=monthly_expense_breakdown.average_cents(total_cents, len(counted.months)),
        categories=categories,
    )


async def get_category_detail(
    *, organization_id: uuid.UUID, range_key: str, scope: str, label: str, today: _dt.date,
) -> MonthlyExpenseCategoryDetailResponse:
    counted = await _counted(
        organization_id=organization_id, range_key=range_key, scope=scope, today=today,
    )
    transactions = monthly_expense_detail.transactions_for(counted.expenses, label)
    return MonthlyExpenseCategoryDetailResponse(
        range=range_key,
        scope=scope,
        label=label,
        currency=BUDGET_CURRENCY,
        total_cents=sum(t.amount_cents for t in transactions),
        payees=monthly_expense_detail.payee_totals(transactions),
        transactions=transactions,
    )
