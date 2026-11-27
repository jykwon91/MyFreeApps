"""The personal finances page's figures from counted rows. Pure.

Money in is every counted income row and money out every row
``spending_ledger`` counts as spent — the same rows Cash flow adds up across
every scope, so the net is Cash flow's net. Two things are moved, never
dropped:

- the rentals' costs (rental rows other than mortgage and loan payments) come
  off rent, so a rental shows as what it nets, and leave expenses;
- one-offs (``one_off_ids``) stay in money in but out of the typical month.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from decimal import Decimal

from app.core.cents import to_cents
from app.core.month_text import format_month, month_start
from app.core.monthly_expense_constants import LOAN_PAYMENT_LABELS
from app.core.payee_keys import payee_key, payee_name
from app.core.personal_finance_constants import (
    INCOME_KIND_OTHER,
    INCOME_KIND_RENTAL,
    INCOME_KIND_SALARY,
    ONE_OFF_MIN_CENTS,
    SALARY_PAYEE_MARKERS,
)
from app.core.spending_category_enums import TRANSACTION_SCOPE_RENTAL
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

_ZERO = Decimal(0)


def income_kind(row: IncomeRow) -> str:
    """Rental by its scope; salary when a payroll company paid it; else other."""
    if row.transaction_scope == TRANSACTION_SCOPE_RENTAL:
        return INCOME_KIND_RENTAL
    name = payee_name(row.vendor, row.description).casefold()
    if any(marker in name for marker in SALARY_PAYEE_MARKERS):
        return INCOME_KIND_SALARY
    return INCOME_KIND_OTHER


def one_off_ids(history: Sequence[IncomeRow]) -> set[uuid.UUID]:
    """Other money in of at least ``ONE_OFF_MIN_CENTS`` from a payer who paid
    in no other month of ``history`` (pass all of it, not just the range, so
    a payer who pays every year isn't a one-off in a one-year range)."""
    months_by_payer: dict[str, set[_dt.date]] = defaultdict(set)
    for row in history:
        key = payee_key(row.vendor, row.description)
        if key is not None:
            months_by_payer[key].add(month_start(row.transaction_date))
    ids: set[uuid.UUID] = set()
    for row in history:
        if income_kind(row) != INCOME_KIND_OTHER or to_cents(row.amount) < ONE_OFF_MIN_CENTS:
            continue
        key = payee_key(row.vendor, row.description)
        if key is None or len(months_by_payer[key]) == 1:
            ids.add(row.id)
    return ids


def rental_cost_ids(rental_spending: Iterable[CountedExpense]) -> set[uuid.UUID]:
    """The rentals' costs that come off rent: every rental row counted as
    spent except mortgage and loan payments, which stay on their own line."""
    return {counted.row.id for counted in rental_spending if counted.label not in LOAN_PAYMENT_LABELS}


def one_off_rows(income: Iterable[IncomeRow], one_offs: set[uuid.UUID]) -> list[PersonalFinancesOneOffResponse]:
    return [
        PersonalFinancesOneOffResponse(
            transaction_id=row.id,
            date=row.transaction_date,
            payee=payee_name(row.vendor, row.description),
            amount_cents=to_cents(row.amount),
        )
        for row in income
        if row.id in one_offs
    ]


def build(
    months: list[_dt.date],
    *,
    income: Iterable[IncomeRow],
    spending: Iterable[CountedExpense],
    rental_costs: set[uuid.UUID],
    one_offs: set[uuid.UUID],
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
    split = {INCOME_KIND_SALARY: _ZERO, INCOME_KIND_RENTAL: _ZERO, INCOME_KIND_OTHER: _ZERO}
    by_label: dict[str, Decimal] = defaultdict(lambda: _ZERO)

    for row in income:
        month = month_start(row.transaction_date)
        if month not in money_in:
            continue
        money_in[month] += row.amount
        split[income_kind(row)] += row.amount
        if row.id in one_offs:
            one_off_in[month] += row.amount
    for counted in spending:
        month = month_start(counted.row.transaction_date)
        if month not in expenses:
            continue
        if counted.row.id in rental_costs:
            money_in[month] -= counted.row.amount
            split[INCOME_KIND_RENTAL] -= counted.row.amount
            continue
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
    income_split = PersonalFinancesIncomeSplitResponse(
        salary_cents=to_cents(split[INCOME_KIND_SALARY]),
        rental_net_cents=to_cents(split[INCOME_KIND_RENTAL]),
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
