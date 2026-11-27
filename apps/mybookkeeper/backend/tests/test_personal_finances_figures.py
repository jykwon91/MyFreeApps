"""The personal finances page's arithmetic, on hand-built rows. Pure."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.core.monthly_expense_constants import LABEL_MORTGAGE
from app.repositories.cash_flow.income_row import IncomeRow
from app.repositories.monthly_expenses.expense_row import ExpenseRow
from app.services.monthly_expenses.counted_expense import CountedExpense
from app.services.personal_finances import personal_finances_figures as figures

SEP, OCT, NOV = _dt.date(2026, 9, 1), _dt.date(2026, 10, 1), _dt.date(2026, 11, 1)


def _in(amount: str, day: _dt.date, vendor: str, scope: str = "personal") -> IncomeRow:
    return IncomeRow(
        id=uuid.uuid4(), transaction_date=day, amount=Decimal(amount), vendor=vendor, description=None,
        transaction_scope=scope,
    )


def _spent(amount: str, day: _dt.date, label: str = "Groceries") -> CountedExpense:
    row = ExpenseRow(
        id=uuid.uuid4(), transaction_date=day, amount=Decimal(amount), transaction_type="expense",
        external_source="plaid", external_category=None, category="other_expense", spending_category_name=None,
        description=None, vendor="Somewhere", account_id=None, account_type=None, account_name=None,
        account_institution=None, account_mask=None, account_user_id=None, to_account_type=None,
    )
    return CountedExpense(row=row, label=label)


class TestIncomeKind:
    def test_payroll_companies_are_salary(self) -> None:
        assert figures.income_kind(_in("1", OCT, "PAYCHEX INC PAYROLL")) == "salary"
        assert figures.income_kind(_in("1", OCT, "Paycor Direct Dep")) == "salary"

    def test_rental_scope_is_rental_whoever_paid(self) -> None:
        assert figures.income_kind(_in("1", OCT, "Zelle from a tenant", scope="rental")) == "rental"

    def test_anything_else_is_other(self) -> None:
        assert figures.income_kind(_in("1", OCT, "Schwab")) == "other"


class TestOneOffs:
    def test_a_large_payment_from_a_payer_seen_once_is_a_one_off(self) -> None:
        schwab = _in("18279.00", OCT, "Schwab beneficiary")
        assert figures.one_off_ids([schwab, _in("5000", OCT, "PAYCHEX")]) == {schwab.id}

    def test_a_payer_who_pays_in_another_month_is_not(self) -> None:
        rows = [_in("3000", SEP, "Side gig LLC"), _in("3000", OCT, "Side gig LLC")]
        assert figures.one_off_ids(rows) == set()

    def test_small_amounts_salary_and_rent_are_not(self) -> None:
        rows = [_in("2499.99", OCT, "Gift"), _in("9000", OCT, "PAYCHEX"), _in("9000", OCT, "Tenant", scope="rental")]
        assert figures.one_off_ids(rows) == set()


class TestBuild:
    def test_rental_costs_come_off_rent_and_mortgages_stay_in_expenses(self) -> None:
        rent = _in("2000", OCT, "Tenant", scope="rental")
        pay = _in("5000", OCT, "PAYCHEX")
        repair = _spent("300", OCT, "Repairs")
        mortgage = _spent("1500", OCT, LABEL_MORTGAGE)
        food = _spent("200", OCT)
        rows, totals, split, categories, _ = figures.build(
            [OCT], income=[rent, pay], spending=[repair, mortgage, food],
            rental_costs=figures.rental_cost_ids([repair, mortgage]), one_offs=set(), this_month=NOV,
        )
        assert split.salary_cents == 500_000
        assert split.rental_net_cents == 170_000
        assert split.other_cents == 0
        assert totals.income_cents == 670_000
        assert totals.expenses_cents == 170_000
        assert totals.mortgages_loans_cents == 150_000
        # The same net as counting everything in and out.
        assert totals.net_cents == (200_000 + 500_000) - (30_000 + 150_000 + 20_000)
        assert [(c.label, c.cents) for c in categories] == [(LABEL_MORTGAGE, 150_000), ("Groceries", 20_000)]
        assert rows[0].net_cents == totals.net_cents

    def test_the_average_leaves_out_this_month_and_the_typical_month_leaves_out_one_offs(self) -> None:
        schwab = _in("18000", SEP, "Schwab")
        income = [_in("5000", SEP, "PAYCHEX"), schwab, _in("5000", OCT, "PAYCHEX"), _in("100", NOV, "PAYCHEX")]
        spending = [_spent("1000", SEP), _spent("3000", OCT), _spent("9999", NOV)]
        _, _, _, _, average = figures.build(
            [SEP, OCT, NOV], income=income, spending=spending, rental_costs=set(), one_offs={schwab.id},
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
            [NOV], income=[_in("100", NOV, "PAYCHEX")], spending=[], rental_costs=set(), one_offs=set(),
            this_month=NOV,
        )
        assert (average.months, average.income_cents) == (1, 10_000)

    def test_empty_months_are_zero(self) -> None:
        rows, totals, _, categories, _ = figures.build(
            [SEP, OCT], income=[], spending=[], rental_costs=set(), one_offs=set(), this_month=NOV,
        )
        assert [r.month for r in rows] == ["2026-09", "2026-10"]
        assert totals.net_cents == 0
        assert categories == []
