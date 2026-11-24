"""Budgets and cash flow against a real (SQLite) database.

Each service opens its own session through ``unit_of_work``; each test
patches it to the test session so commits behave as they do in production.

Pinned: only counted rows count — a deleted row, a duplicate, a row still to
review, a transfer, another workspace's row and a rental/business row never
reach the budget; a refund filed to a category comes off it; setting a budget
from a month on keeps the earlier months' target and a second write in the
same month updates it; an archived or foreign category can't be budgeted.
Cash flow splits by scope, narrows to an account, and never counts a transfer.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budgets.spending_budget import SpendingBudget
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.organization.organization import Organization
from app.models.transactions.spending_category import SpendingCategory
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.schemas.budgets.spending_budget_update_request import SpendingBudgetUpdateRequest
from app.services.budgets import budget_service
from app.services.cash_flow import cash_flow_service

pytestmark = pytest.mark.asyncio

MARCH = _dt.date(2026, 3, 1)
APRIL = _dt.date(2026, 4, 1)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with (
        patch.object(budget_service, "unit_of_work", _uow),
        patch.object(cash_flow_service, "unit_of_work", _uow),
    ):
        yield


async def _category(db: AsyncSession, org: Organization, name: str, **overrides: object) -> SpendingCategory:
    category = SpendingCategory(id=uuid.uuid4(), organization_id=org.id, name=name, is_default=False, **overrides)
    db.add(category)
    await db.commit()
    return category


async def _account(db: AsyncSession, org: Organization, user: User) -> FinancialAccount:
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name="Chase Checking", account_type="checking",
    )
    db.add(account)
    await db.commit()
    return account


async def _txn(
    db: AsyncSession, org: Organization, user: User, amount: str, **overrides: object,
) -> Transaction:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "organization_id": org.id,
        "user_id": user.id,
        "transaction_date": _dt.date(2026, 3, 10),
        "tax_year": 2026,
        "amount": Decimal(amount),
        "transaction_type": "expense",
        "category": "other_expense",
        "transaction_scope": "personal",
        "status": "approved",
    }
    values.update(overrides)
    txn = Transaction(**values)
    db.add(txn)
    await db.commit()
    return txn


def _set(month: str, cents: int | None) -> SpendingBudgetUpdateRequest:
    return SpendingBudgetUpdateRequest(effective_month=month, amount_cents=cents)


class TestWhatCountsTowardTheBudget:
    async def test_only_counted_personal_spending_counts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        groceries = await _category(db, test_org, "Groceries")
        filed = {"spending_category_id": groceries.id}
        await _txn(db, test_org, test_user, "100.00", **filed)
        await _txn(db, test_org, test_user, "1.00", deleted_at=_dt.datetime.now(_dt.timezone.utc), **filed)
        await _txn(db, test_org, test_user, "2.00", status="duplicate", **filed)
        await _txn(db, test_org, test_user, "4.00", status="needs_review", **filed)
        await _txn(db, test_org, test_user, "8.00", transaction_date=_dt.date(2026, 4, 1), **filed)
        await _txn(db, test_org, test_user, "16.00", transaction_scope="rental")
        await _txn(db, test_org, test_user, "32.00", transaction_type="transfer", category="transfer")
        other_org = Organization(id=uuid.uuid4(), name="Elsewhere", created_by=test_user.id)
        db.add(other_org)
        await db.commit()
        await _txn(db, other_org, test_user, "64.00")

        with _session(db):
            result = await budget_service.get_month(organization_id=test_org.id, month=MARCH)

        [line] = [line for line in result.lines if line.name == "Groceries"]
        assert line.spent_cents == 100_00
        assert result.uncategorized_spent_cents == 0
        assert result.totals.spent_cents == 100_00

    async def test_a_refund_comes_off_its_category_and_a_paycheck_is_ignored(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        shopping = await _category(db, test_org, "Shopping")
        await _txn(db, test_org, test_user, "120.00", spending_category_id=shopping.id)
        await _txn(
            db, test_org, test_user, "20.00", transaction_type="income", category="uncategorized",
            spending_category_id=shopping.id,
        )
        await _txn(db, test_org, test_user, "3000.00", transaction_type="income", category="uncategorized")
        await _txn(db, test_org, test_user, "7.50")

        with _session(db):
            result = await budget_service.get_month(organization_id=test_org.id, month=MARCH)

        [line] = result.lines
        assert (line.spent_cents, line.refunded_cents) == (100_00, 20_00)
        assert result.uncategorized_spent_cents == 7_50
        assert result.totals.spent_cents == 107_50


class TestSettingABudget:
    async def test_a_change_holds_from_its_month_on_and_keeps_earlier_months(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        dining = await _category(db, test_org, "Dining")
        with _session(db):
            await budget_service.set_budget(
                organization_id=test_org.id, spending_category_id=dining.id, payload=_set("2026-03", 200_00),
            )
            saved = await budget_service.set_budget(
                organization_id=test_org.id, spending_category_id=dining.id, payload=_set("2026-04", 250_00),
            )
            march = await budget_service.get_month(organization_id=test_org.id, month=MARCH)
            april = await budget_service.get_month(organization_id=test_org.id, month=APRIL)
            may = await budget_service.get_month(organization_id=test_org.id, month=_dt.date(2026, 5, 1))
            february = await budget_service.get_month(organization_id=test_org.id, month=_dt.date(2026, 2, 1))

        assert (saved.effective_month, saved.amount_cents) == ("2026-04", 250_00)
        assert march.lines[0].budget_cents == 200_00
        assert april.lines[0].budget_cents == 250_00
        assert may.lines[0].budget_cents == 250_00
        assert february.lines[0].budget_cents is None

    async def test_a_second_write_in_the_same_month_updates_it(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        dining = await _category(db, test_org, "Dining")
        with _session(db):
            for cents in (200_00, 180_00, None):
                await budget_service.set_budget(
                    organization_id=test_org.id, spending_category_id=dining.id, payload=_set("2026-03", cents),
                )
        rows = (await db.execute(select(SpendingBudget))).scalars().all()
        assert [(row.effective_month, row.amount_cents) for row in rows] == [(MARCH, None)]

    async def test_an_archived_category_cannot_be_budgeted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        old = await _category(db, test_org, "Old", archived_at=_dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc))
        with _session(db), pytest.raises(budget_service.BudgetCategoryArchivedError):
            await budget_service.set_budget(
                organization_id=test_org.id, spending_category_id=old.id, payload=_set("2026-03", 1_00),
            )

    async def test_another_workspace_category_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        dining = await _category(db, test_org, "Dining")
        with _session(db), pytest.raises(budget_service.BudgetCategoryNotFoundError):
            await budget_service.set_budget(
                organization_id=uuid.uuid4(), spending_category_id=dining.id, payload=_set("2026-03", 1_00),
            )


class TestCashFlow:
    async def test_splits_by_scope_narrows_to_an_account_and_skips_transfers(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        checking = await _account(db, test_org, test_user)
        await _txn(db, test_org, test_user, "3000.00", transaction_type="income", category="uncategorized",
                   account_id=checking.id)
        await _txn(db, test_org, test_user, "200.00", account_id=checking.id)
        await _txn(db, test_org, test_user, "1500.00", transaction_type="income", category="rental_revenue",
                   transaction_scope="rental")
        await _txn(db, test_org, test_user, "500.00", transaction_type="transfer", category="transfer",
                   account_id=checking.id)
        await _txn(db, test_org, test_user, "9.00", status="duplicate", account_id=checking.id)

        async def _flow(scope: str, account_id: uuid.UUID | None = None):
            return await cash_flow_service.get_cash_flow(
                organization_id=test_org.id, range_key="ytd", scope=scope, account_id=account_id,
                today=_dt.date(2026, 3, 20),
            )

        with _session(db):
            everything = await _flow("all")
            personal = await _flow("personal")
            rental = await _flow("rental")
            on_checking = await _flow("all", checking.id)

        assert [m.month for m in everything.months] == ["2026-01", "2026-02", "2026-03"]
        assert (everything.totals.money_in_cents, everything.totals.money_out_cents) == (4500_00, 200_00)
        assert (personal.totals.money_in_cents, personal.totals.money_out_cents) == (3000_00, 200_00)
        assert (rental.totals.money_in_cents, rental.totals.money_out_cents) == (1500_00, 0)
        assert on_checking.totals.net_cents == 2800_00
        assert everything.months[2].net_cents == 4300_00

    async def test_refuses_an_unknown_range_or_scope(self, test_org: Organization) -> None:
        with pytest.raises(cash_flow_service.InvalidCashFlowRangeError):
            await cash_flow_service.get_cash_flow(
                organization_id=test_org.id, range_key="5y", scope="all", account_id=None,
                today=_dt.date(2026, 3, 20),
            )
        with pytest.raises(cash_flow_service.InvalidCashFlowScopeError):
            await cash_flow_service.get_cash_flow(
                organization_id=test_org.id, range_key="6m", scope="savings", account_id=None,
                today=_dt.date(2026, 3, 20),
            )
