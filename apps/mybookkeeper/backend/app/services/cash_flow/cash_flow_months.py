"""Money in vs out per month. Pure.

Money in is every counted income row, as it is — a refund is money in. (The
budget page nets a refund against its category instead; this page shows money
moving.) Money out is every row ``spending_ledger`` counts as spent, the same
rows Monthly expenses adds up: so it leaves out paying off a card and money
between your own accounts, and includes mortgage and loan payments, which
also get their own line.
"""
from __future__ import annotations

import datetime as _dt
from collections.abc import Iterable
from decimal import Decimal

from app.core.budget_constants import RANGE_MONTHS
from app.core.cents import to_cents
from app.core.month_text import add_months, format_month, month_start
from app.core.monthly_expense_constants import LOAN_PAYMENT_LABELS
from app.repositories.cash_flow.cash_flow_repo import MonthIncome
from app.schemas.cash_flow.cash_flow_month_response import CashFlowMonthResponse
from app.schemas.cash_flow.cash_flow_totals_response import CashFlowTotalsResponse
from app.services.monthly_expenses.counted_expense import CountedExpense

_ZERO = Decimal(0)


def range_months(range_key: str, today: _dt.date) -> list[_dt.date]:
    """The first of each month in the range, oldest first, ending with this
    month. ``range_key`` must be one of ``RANGE_MONTHS``."""
    this_month = month_start(today)
    count = RANGE_MONTHS[range_key]
    first = this_month.replace(month=1) if count is None else add_months(this_month, 1 - count)
    months: list[_dt.date] = []
    month = first
    while month <= this_month:
        months.append(month)
        month = add_months(month, 1)
    return months


def build_months(
    months: list[_dt.date], income: Iterable[MonthIncome], spending: Iterable[CountedExpense],
) -> tuple[list[CashFlowMonthResponse], CashFlowTotalsResponse]:
    """One entry per month in ``months`` (empty ones are zero), and the sums."""
    money_in = {month: _ZERO for month in months}
    money_out = {month: _ZERO for month in months}
    loan_payments = {month: _ZERO for month in months}
    for year, month_number, total in income:
        month = _dt.date(year, month_number, 1)
        if month in money_in:
            money_in[month] += total
    for counted in spending:
        month = month_start(counted.row.transaction_date)
        if month not in money_out:
            continue
        money_out[month] += counted.row.amount
        if counted.label in LOAN_PAYMENT_LABELS:
            loan_payments[month] += counted.row.amount

    rows = []
    for month in months:
        in_cents, out_cents = to_cents(money_in[month]), to_cents(money_out[month])
        rows.append(CashFlowMonthResponse(
            month=format_month(month),
            money_in_cents=in_cents,
            money_out_cents=out_cents,
            mortgages_loans_cents=to_cents(loan_payments[month]),
            net_cents=in_cents - out_cents,
        ))
    total_in = sum(row.money_in_cents for row in rows)
    total_out = sum(row.money_out_cents for row in rows)
    return rows, CashFlowTotalsResponse(
        money_in_cents=total_in,
        money_out_cents=total_out,
        mortgages_loans_cents=sum(row.mortgages_loans_cents for row in rows),
        net_cents=total_in - total_out,
    )
