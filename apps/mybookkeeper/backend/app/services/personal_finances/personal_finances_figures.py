"""The personal finances page's figures from counted rows. Pure.

Money in is every counted income row and money out every row
``spending_ledger`` counts as spent — the same rows Cash flow adds up across
every scope, so income, expenses and net are Cash flow's. Income is what came
in, so it is never below zero: the rentals' costs (rental rows other than
mortgage and loan payments) stay in expenses, and the split says what the
rentals netted after them. One-offs (``income_kinds``) stay in money in but
out of the typical month.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal

from app.core.cents import to_cents
from app.core.month_text import format_month, month_start
from app.core.monthly_expense_constants import LOAN_PAYMENT_LABELS
from app.core.payee_keys import payee_name
from app.core.personal_finance_constants import (
    INCOME_KIND_ONE_OFF,
    INCOME_KIND_OTHER,
    INCOME_KIND_RENTAL,
    INCOME_KIND_SALARY,
)
from app.repositories.cash_flow.income_row import IncomeRow
from app.schemas.personal_finances.personal_finances_average_response import (
    PersonalFinancesAverageResponse,
)
from app.schemas.personal_finances.personal_finances_category_response import (
    PersonalFinancesCategoryResponse,
)
from app.schemas.personal_finances.personal_finances_income_split_response import (
    PersonalFinancesIncomeSplitResponse,
)
from app.schemas.personal_finances.personal_finances_month_response import (
    PersonalFinancesMonthResponse,
)
from app.schemas.personal_finances.personal_finances_one_off_response import (
    PersonalFinancesOneOffResponse,
)
from app.schemas.personal_finances.personal_finances_totals_response import (
    PersonalFinancesTotalsResponse,
)
from app.services.monthly_expenses.counted_expense import CountedExpense
from app.services.personal_finances.income_context import IncomeContext
from app.services.personal_finances.income_kinds import income_kind

_ZERO = Decimal(0)


def rental_cost_ids(rental_spending: Iterable[CountedExpense]) -> set[uuid.UUID]:
    """The rentals' costs that come off rent: every rental row counted as
    spent except mortgage and loan payments, which stay on their own line."""
    return {counted.row.id for counted in rental_spending if counted.label not in LOAN_PAYMENT_LABELS}


def one_off_rows(income: Iterable[IncomeRow], context: IncomeContext) -> list[PersonalFinancesOneOffResponse]:
    return [
        PersonalFinancesOneOffResponse(
            transaction_id=row.id,
            date=row.transaction_date,
            payee=payee_name(row.vendor, row.description),
            amount_cents=to_cents(row.amount),
        )
        for row in income
        if row.id in context.one_offs
    ]


def build(
    months: list[_dt.date],
    *,
    income: Iterable[IncomeRow],
    spending: Iterable[CountedExpense],
    rental_costs: set[uuid.UUID],
    context: IncomeContext,
    this_month: _dt.date,
) -> tuple[
    list[PersonalFinancesMonthResponse],
    PersonalFinancesTotalsResponse,
    PersonalFinancesIncomeSplitResponse,
    list[PersonalFinancesCategoryResponse],
    PersonalFinancesAverageResponse,
]:
    """One entry per month in ``months`` (empty ones are zero), the sums,
    where money in came from, expenses by heading and the monthly average."""
    money_in = {month: _ZERO for month in months}
    one_off_in = {month: _ZERO for month in months}
    expenses = {month: _ZERO for month in months}
    loan_payments = {month: _ZERO for month in months}
    split = {kind: _ZERO for kind in (INCOME_KIND_SALARY, INCOME_KIND_RENTAL, INCOME_KIND_ONE_OFF, INCOME_KIND_OTHER)}
    rental_cost_total = _ZERO
    by_label: dict[str, Decimal] = defaultdict(lambda: _ZERO)

    for row in income:
        month = month_start(row.transaction_date)
        if month not in money_in:
            continue
        money_in[month] += row.amount
        kind = income_kind(row, context)
        split[kind] += row.amount
        if kind == INCOME_KIND_ONE_OFF:
            one_off_in[month] += row.amount
    for counted in spending:
        month = month_start(counted.row.transaction_date)
        if month not in expenses:
            continue
        if counted.row.id in rental_costs:
            rental_cost_total += counted.row.amount
        expenses[month] += counted.row.amount
        by_label[counted.label] += counted.row.amount
        if counted.label in LOAN_PAYMENT_LABELS:
            loan_payments[month] += counted.row.amount

    rows = []
    for month in months:
        in_cents, out_cents = to_cents(money_in[month]), to_cents(expenses[month])
        rows.append(PersonalFinancesMonthResponse(
            month=format_month(month),
            income_cents=in_cents,
            expenses_cents=out_cents,
            mortgages_loans_cents=to_cents(loan_payments[month]),
            net_cents=in_cents - out_cents,
        ))
    total_in = sum(row.income_cents for row in rows)
    total_out = sum(row.expenses_cents for row in rows)
    totals = PersonalFinancesTotalsResponse(
        income_cents=total_in,
        expenses_cents=total_out,
        mortgages_loans_cents=sum(row.mortgages_loans_cents for row in rows),
        net_cents=total_in - total_out,
    )
    rental_cents, rental_costs_cents = to_cents(split[INCOME_KIND_RENTAL]), to_cents(rental_cost_total)
    income_split = PersonalFinancesIncomeSplitResponse(
        salary_cents=to_cents(split[INCOME_KIND_SALARY]),
        rental_cents=rental_cents,
        rental_costs_cents=rental_costs_cents,
        rental_net_cents=rental_cents - rental_costs_cents,
        one_off_cents=to_cents(split[INCOME_KIND_ONE_OFF]),
        other_cents=to_cents(split[INCOME_KIND_OTHER]),
    )
    categories = sorted(
        (PersonalFinancesCategoryResponse(label=label, cents=to_cents(total)) for label, total in by_label.items()),
        key=lambda category: (-category.cents, category.label),
    )
    return rows, totals, income_split, categories, _average(rows, months, one_off_in, this_month)


def _average(
    rows: list[PersonalFinancesMonthResponse],
    months: list[_dt.date],
    one_off_in: dict[_dt.date, Decimal],
    this_month: _dt.date,
) -> PersonalFinancesAverageResponse:
    """Over the range's full months: this month is left out while it's still
    going, unless it's the only one."""
    full = [(row, month) for row, month in zip(rows, months, strict=True) if month != this_month] or list(
        zip(rows, months, strict=True),
    )
    count = len(full)
    if count == 0:
        return PersonalFinancesAverageResponse(
            months=0, income_cents=0, expenses_cents=0, net_cents=0, typical_income_cents=0, typical_net_cents=0,
        )
    income = sum(row.income_cents for row, _ in full)
    out = sum(row.expenses_cents for row, _ in full)
    typical_income = income - sum(to_cents(one_off_in[month]) for _, month in full)
    return PersonalFinancesAverageResponse(
        months=count,
        income_cents=round(income / count),
        expenses_cents=round(out / count),
        net_cents=round((income - out) / count),
        typical_income_cents=round(typical_income / count),
        typical_net_cents=round((typical_income - out) / count),
    )
