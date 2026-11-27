"""Cash flow months, as pure functions.

Pinned: each range ends with this month (6M and 12M count back, YTD starts in
January, crossing a year boundary correctly); every month is listed, empty
ones as zero; rows outside the range are ignored; net is in - out; mortgage
and loan payments are money out and their own line.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.repositories.cash_flow.income_row import IncomeRow
from app.repositories.monthly_expenses.expense_row import ExpenseRow
from app.services.cash_flow import cash_flow_months
from app.services.monthly_expenses.counted_expense import CountedExpense


def test_six_months_cross_into_last_year() -> None:
    months = cash_flow_months.range_months("6m", _dt.date(2026, 2, 17))
    assert months[0] == _dt.date(2025, 9, 1)
    assert months[-1] == _dt.date(2026, 2, 1)
    assert len(months) == 6


def test_twelve_months_and_year_to_date() -> None:
    assert len(cash_flow_months.range_months("12m", _dt.date(2026, 7, 4))) == 12
    assert cash_flow_months.range_months("ytd", _dt.date(2026, 3, 31)) == [
        _dt.date(2026, 1, 1), _dt.date(2026, 2, 1), _dt.date(2026, 3, 1),
    ]
    assert cash_flow_months.range_months("ytd", _dt.date(2026, 1, 2)) == [_dt.date(2026, 1, 1)]


def _spent(day: _dt.date, label: str, amount: str) -> CountedExpense:
    row = ExpenseRow(
        id=uuid.uuid4(), transaction_date=day, amount=Decimal(amount), transaction_type="expense",
        external_source=None, external_category=None, category="other_expense", spending_category_name=None,
        description=None, vendor=None, account_id=None, account_type=None, account_name=None,
        account_institution=None, account_mask=None, account_user_id=None, to_account_type=None,
    )
    return CountedExpense(row=row, label=label)


def _in(day: _dt.date, amount: str) -> IncomeRow:
    return IncomeRow(
        id=uuid.uuid4(), transaction_date=day, amount=Decimal(amount), vendor=None, description=None,
        category="uncategorized", transaction_scope="personal",
    )


def test_every_month_is_listed_and_net_is_in_minus_out() -> None:
    months = [_dt.date(2026, 1, 1), _dt.date(2026, 2, 1), _dt.date(2026, 3, 1)]
    rows, totals = cash_flow_months.build_months(
        months,
        [_in(_dt.date(2026, 1, 20), "1000.00"), _in(_dt.date(2025, 12, 31), "999")],  # the last is outside the range
        [
            _spent(_dt.date(2026, 1, 5), "Groceries", "250.25"),
            _spent(_dt.date(2026, 3, 9), "Other", "10"),
            _spent(_dt.date(2025, 12, 31), "Other", "500"),  # outside the range
        ],
    )
    assert [r.month for r in rows] == ["2026-01", "2026-02", "2026-03"]
    assert (rows[0].money_in_cents, rows[0].money_out_cents, rows[0].net_cents) == (1000_00, 250_25, 749_75)
    assert (rows[1].money_in_cents, rows[1].money_out_cents) == (0, 0)
    assert rows[2].net_cents == -10_00
    assert (totals.money_in_cents, totals.money_out_cents, totals.net_cents) == (1000_00, 260_25, 739_75)


def test_mortgage_and_loan_payments_are_money_out_and_their_own_line() -> None:
    months = [_dt.date(2026, 10, 1), _dt.date(2026, 11, 1)]
    rows, totals = cash_flow_months.build_months(months, [], [
        _spent(_dt.date(2026, 10, 1), "Mortgage", "3413.96"),
        _spent(_dt.date(2026, 10, 15), "Car & other loans", "816.53"),
        _spent(_dt.date(2026, 10, 20), "Groceries", "100.00"),
        _spent(_dt.date(2026, 11, 1), "Mortgage", "1123.26"),
    ])
    assert [(r.money_out_cents, r.mortgages_loans_cents) for r in rows] == [(4330_49, 4230_49), (1123_26, 1123_26)]
    assert (totals.money_out_cents, totals.mortgages_loans_cents, totals.net_cents) == (5453_75, 5353_75, -5453_75)
