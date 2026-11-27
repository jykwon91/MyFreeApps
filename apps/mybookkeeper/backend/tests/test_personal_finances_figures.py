"""The personal finances page's arithmetic, on hand-built rows. Pure."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.core.monthly_expense_constants import LABEL_MORTGAGE
from app.repositories.cash_flow.income_row import IncomeRow
from app.repositories.monthly_expenses.expense_row import ExpenseRow
from app.services.monthly_expenses.counted_expense import CountedExpense
from app.services.personal_finances import income_kinds
from app.services.personal_finances import personal_finances_figures as figures
from app.services.personal_finances.income_context import IncomeContext

SEP, OCT, NOV = _dt.date(2026, 9, 1), _dt.date(2026, 10, 1), _dt.date(2026, 11, 1)


def _in(amount: str, day: _dt.date, vendor: str, scope: str = "personal") -> IncomeRow:
    return IncomeRow(
        id=uuid.uuid4(), transaction_date=day, amount=Decimal(amount), vendor=vendor, description=None,
        category="uncategorized", transaction_scope=scope,
    )


def _context(income: list[IncomeRow]) -> IncomeContext:
    return income_kinds.income_context(income, ())


def _spent(amount: str, day: _dt.date, label: str = "Groceries") -> CountedExpense:
    row = ExpenseRow(
        id=uuid.uuid4(), transaction_date=day, amount=Decimal(amount), transaction_type="expense",
        external_source="plaid", external_category=None, category="other_expense", spending_category_name=None,
        description=None, vendor="Somewhere", account_id=None, account_type=None, account_name=None,
        account_institution=None, account_mask=None, account_user_id=None, to_account_type=None,
    )
    return CountedExpense(row=row, label=label)


class TestBuild:
    def test_income_is_what_came_in_and_the_rentals_costs_stay_in_expenses(self) -> None:
        rent = _in("2000", OCT, "Tenant", scope="rental")
        pay = _in("5000", OCT, "PAYCHEX")
        repair = _spent("300", OCT, "Repairs")
        mortgage = _spent("1500", OCT, LABEL_MORTGAGE)
        food = _spent("200", OCT)
        rows, totals, split, categories, _ = figures.build(
            [OCT], income=[rent, pay], spending=[repair, mortgage, food],
            rental_costs=figures.rental_cost_ids([repair, mortgage]), context=_context([rent, pay]), this_month=NOV,
        )
        assert split.salary_cents == 500_000
        assert (split.rental_cents, split.rental_costs_cents, split.rental_net_cents) == (200_000, 30_000, 170_000)
        assert (split.one_off_cents, split.other_cents) == (0, 0)
        assert totals.income_cents == 700_000
        assert totals.expenses_cents == 200_000
        assert totals.mortgages_loans_cents == 150_000
        # The same net as counting everything in and out.
        assert totals.net_cents == (200_000 + 500_000) - (30_000 + 150_000 + 20_000)
        assert [(c.label, c.cents) for c in categories] == [
            (LABEL_MORTGAGE, 150_000), ("Repairs", 30_000), ("Groceries", 20_000),
        ]
        assert rows[0].net_cents == totals.net_cents

    def test_the_average_leaves_out_this_month_and_the_typical_month_leaves_out_one_offs(self) -> None:
        schwab = _in("18000", SEP, "Schwab")
        income = [_in("5000", SEP, "PAYCHEX"), schwab, _in("5000", OCT, "PAYCHEX"), _in("100", NOV, "PAYCHEX")]
        spending = [_spent("1000", SEP), _spent("3000", OCT), _spent("9999", NOV)]
        _, _, _, _, average = figures.build(
            [SEP, OCT, NOV], income=income, spending=spending, rental_costs=set(), context=_context(income),
            this_month=NOV,
        )
        assert average.months == 2
        assert average.income_cents == 1_400_000
        assert average.expenses_cents == 200_000
        assert average.net_cents == 1_200_000
        assert average.typical_income_cents == 500_000
        assert average.typical_net_cents == 300_000

    def test_a_range_of_just_this_month_averages_over_it(self) -> None:
        _, _, _, _, average = figures.build(
            [NOV], income=[_in("100", NOV, "PAYCHEX")], spending=[], rental_costs=set(), context=_context([]),
            this_month=NOV,
        )
        assert (average.months, average.income_cents) == (1, 10_000)

    def test_empty_months_are_zero(self) -> None:
        rows, totals, _, categories, _ = figures.build(
            [SEP, OCT], income=[], spending=[], rental_costs=set(), context=_context([]), this_month=NOV,
        )
        assert [r.month for r in rows] == ["2026-09", "2026-10"]
        assert totals.net_cents == 0
        assert categories == []

    def test_a_month_the_rentals_cost_more_than_they_brought_in_has_income_above_zero(self) -> None:
        rent = _in("240", OCT, "Tenant", scope="rental")
        repair = _spent("1069", OCT, "Repairs")
        rows, totals, split, _, _ = figures.build(
            [OCT], income=[rent], spending=[repair], rental_costs=figures.rental_cost_ids([repair]),
            context=_context([rent]), this_month=NOV,
        )
        assert rows[0].income_cents == 24_000
        assert rows[0].net_cents == 24_000 - 106_900
        assert split.rental_net_cents == 24_000 - 106_900
        assert totals.income_cents == 24_000

    def test_one_offs_are_their_own_part_of_income(self) -> None:
        schwab = _in("18279", OCT, "CHARLES SCHWAB T BENEF")
        _, totals, split, _, _ = figures.build(
            [OCT], income=[schwab], spending=[], rental_costs=set(), context=_context([schwab]), this_month=NOV,
        )
        assert (split.one_off_cents, split.other_cents, totals.income_cents) == (1_827_900, 0, 1_827_900)
