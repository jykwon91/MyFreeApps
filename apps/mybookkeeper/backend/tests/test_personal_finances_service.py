"""The personal finances page against a real (SQLite) database.

Pinned: it counts the rows Cash flow counts (same net), sorts money in into
pay, rent net of the rentals' costs and the rest, keeps a tagged mortgage in
expenses on its own line, flags a one-off inheritance without dropping it,
leaves out own-account moves and card payments, holds the range inside the
bank history, and shows nothing (not zeros dressed up as figures) with no
bank connected.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import loan_payee_repo
from app.services.cash_flow import cash_flow_service
from app.services.personal_finances import personal_finances_service

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 11, 20)
TDECU = "Pat Doe External F Pat Doe WEB ID: 1234567890"


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with (
        patch.object(cash_flow_service, "unit_of_work", _uow),
        patch.object(personal_finances_service, "unit_of_work", _uow),
    ):
        yield


async def _account(db: AsyncSession, org: Organization, user: User, name: str, account_type: str) -> FinancialAccount:
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name=name, account_type=account_type,
    )
    db.add(account)
    await db.commit()
    return account


async def _txn(
    db: AsyncSession, org: Organization, user: User, account: FinancialAccount, amount: str, day: _dt.date,
    **overrides: object,
) -> Transaction:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "organization_id": org.id,
        "user_id": user.id,
        "transaction_date": day,
        "tax_year": day.year,
        "amount": Decimal(amount),
        "transaction_type": "expense",
        "category": "other_expense",
        "transaction_scope": "personal",
        "status": "approved",
        "account_id": account.id,
        "external_source": "plaid",
        "external_id": str(uuid.uuid4()),
    }
    values.update(overrides)
    txn = Transaction(**values)
    db.add(txn)
    await db.commit()
    return txn


async def _setup(db: AsyncSession, org: Organization, user: User) -> None:
    user.name = "Pat Doe"
    await db.commit()
    checking = await _account(db, org, user, "Personal checking", "checking")
    savings = await _account(db, org, user, "Savings", "savings")
    card = await _account(db, org, user, "Sapphire", "credit_card")
    for month in (9, 10):
        day = _dt.date(2026, month, 1)
        await _txn(db, org, user, checking, "5000.00", day, transaction_type="income", category="uncategorized",
                   vendor="PAYCHEX INC")
        await _txn(db, org, user, checking, "2000.00", day.replace(day=3), transaction_type="income",
                   category="rental_revenue", transaction_scope="rental", vendor="Tenant rent")
        await _txn(db, org, user, checking, "3413.96", day.replace(day=5), description=TDECU,
                   external_category="TRANSFER_OUT")
    # A rental repair, a grocery run on the card, and paying the card off.
    await _txn(db, org, user, checking, "300.00", _dt.date(2026, 10, 8), category="maintenance",
               transaction_scope="rental", vendor="Plumber")
    await _txn(db, org, user, card, "120.00", _dt.date(2026, 10, 9), vendor="HEB", external_category="FOOD_AND_DRINK")
    await _txn(db, org, user, checking, "120.00", _dt.date(2026, 10, 12), description="CHASE CREDIT CRD AUTOPAY",
               external_category="LOAN_PAYMENTS")
    await _txn(db, org, user, card, "120.00", _dt.date(2026, 10, 12), transaction_type="income",
               category="uncategorized", external_category="LOAN_PAYMENTS")
    # Money moved to savings, and a one-off inheritance.
    await _txn(db, org, user, checking, "1000.00", _dt.date(2026, 10, 15), transaction_type="transfer",
               category="transfer", transfer_to_account_id=savings.id)
    await _txn(db, org, user, checking, "18279.00", _dt.date(2026, 10, 20), transaction_type="income",
               category="uncategorized", vendor="Schwab beneficiary")


async def _get(org: Organization, start: str | None = "2026-09", end: str | None = "2026-10"):
    return await personal_finances_service.get_personal_finances(
        organization_id=org.id, start=start, end=end, today=TODAY,
    )


class TestPersonalFinances:
    async def test_untagged_mortgage_transfers_are_not_spending(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _setup(db, test_org, test_user)
        with _session(db):
            result = await _get(test_org)
        assert result.totals.mortgages_loans_cents == 0
        assert result.totals.expenses_cents == 120_00

    async def test_figures_once_the_mortgage_payee_is_tagged(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _setup(db, test_org, test_user)
        await loan_payee_repo.remember(
            db, organization_id=test_org.id, created_by_user_id=test_user.id, payee=TDECU, kind="mortgage",
        )
        await db.commit()
        with _session(db):
            result = await _get(test_org)
            flow = await cash_flow_service.get_cash_flow(
                organization_id=test_org.id, range_key="6m", scope="all", account_id=None, today=TODAY,
            )

        assert result.income_split.salary_cents == 10_000_00
        assert result.income_split.rental_net_cents == 4_000_00 - 300_00
        assert result.income_split.other_cents == 18_279_00
        assert result.totals.income_cents == 10_000_00 + 3_700_00 + 18_279_00
        assert result.totals.mortgages_loans_cents == 2 * 3_413_96
        assert result.totals.expenses_cents == 2 * 3_413_96 + 120_00
        assert [(c.label, c.cents) for c in result.by_category][0] == ("Mortgage", 2 * 3_413_96)

        # Every row Cash flow counts, so the same net.
        flow_net = sum(m.net_cents for m in flow.months if m.month in {"2026-09", "2026-10"})
        assert result.totals.net_cents == flow_net

        (one_off,) = result.one_offs
        assert (one_off.payee, one_off.amount_cents) == ("Schwab beneficiary", 18_279_00)
        assert result.average.months == 2
        assert result.average.typical_income_cents == result.average.income_cents - 18_279_00 // 2

    async def test_the_range_runs_from_the_bank_history_start_to_this_month(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _setup(db, test_org, test_user)
        with _session(db):
            result = await _get(test_org, start=None, end=None)
            year = await _get(test_org, start="2026-01", end="2026-12")
        assert (result.start, result.end) == ("2026-09", "2026-11")
        assert (year.start, year.end) == ("2026-09", "2026-11")
        assert result.years == [2026]
        assert [m.month for m in result.months] == ["2026-09", "2026-10", "2026-11"]

    async def test_a_range_outside_the_bank_history_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _setup(db, test_org, test_user)
        with _session(db), pytest.raises(personal_finances_service.InvalidPersonalFinancesRangeError):
            await _get(test_org, start="2025-01", end="2025-12")

    async def test_nothing_to_show_without_a_bank(self, db: AsyncSession, test_org: Organization) -> None:
        with _session(db):
            result = await _get(test_org)
        assert result.bank_history_start is None
        assert result.months == [] and result.years == [] and result.start is None
