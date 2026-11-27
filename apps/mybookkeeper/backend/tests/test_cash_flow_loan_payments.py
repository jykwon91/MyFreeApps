"""Cash flow's money out is what Monthly expenses counts as spent, with
mortgage and loan payments on their own line — against a real (SQLite)
database.

Shaped like the operator's month: two mortgages paid from checking under
their own name ("<name> External F <name> WEB ID: ..."), a lender's ACH for
a third, a car loan, a card payment, money moved to savings, and a purchase.

Pinned: a payment under your own name isn't money out until its payee is
tagged a mortgage, then it is, on the "Mortgages & loans" line; a transfer
into a mortgage account counts; paying off a card, moving money to savings
and interest a lender adds don't, nor is the card's side of its payment
money in; a row still waiting for review doesn't (Cash flow counts approved
rows; Monthly expenses counts it too); narrowing to an account narrows money out
too; and Monthly expenses agrees with every other number.
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
from app.services.monthly_expenses import monthly_expense_service

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 11, 20)
OCT = _dt.date(2026, 10, 1)
TDECU = "Pat Doe External F Pat Doe WEB ID: 1234567890"


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(cash_flow_service, "unit_of_work", _uow), patch.object(monthly_expense_service, "unit_of_work", _uow):
        yield


async def _account(db: AsyncSession, org: Organization, user: User, name: str, account_type: str) -> FinancialAccount:
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name=name, account_type=account_type,
    )
    db.add(account)
    await db.commit()
    return account


async def _txn(
    db: AsyncSession, org: Organization, user: User, account: FinancialAccount, amount: str, day: int,
    **overrides: object,
) -> Transaction:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "organization_id": org.id,
        "user_id": user.id,
        "transaction_date": OCT.replace(day=day),
        "tax_year": 2026,
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


async def _october(org: Organization, account_id: uuid.UUID | None = None):
    flow = await cash_flow_service.get_cash_flow(
        organization_id=org.id, range_key="6m", scope="all", account_id=account_id, today=TODAY,
    )
    (month,) = [m for m in flow.months if m.month == "2026-10"]
    return month


async def _setup(db: AsyncSession, org: Organization, user: User) -> dict[str, FinancialAccount]:
    user.name = "Pat Doe"
    await db.commit()
    accounts = {
        "checking": await _account(db, org, user, "Personal checking", "checking"),
        "savings": await _account(db, org, user, "Savings", "savings"),
        "card": await _account(db, org, user, "Sapphire", "credit_card"),
        "mortgage": await _account(db, org, user, "6738 mortgage", "mortgage"),
    }
    checking = accounts["checking"]
    await _txn(db, org, user, checking, "5000.00", 1, transaction_type="income", category="uncategorized",
               vendor="PAYCHEX")
    # Two mortgages paid under the holder's own name.
    await _txn(db, org, user, checking, "3413.96", 2, description=TDECU, external_category="TRANSFER_OUT")
    await _txn(db, org, user, checking, "3168.19", 3, description=TDECU, external_category="TRANSFER_OUT")
    # A transfer the bank paired into a tracked mortgage account.
    await _txn(db, org, user, checking, "1123.26", 4, transaction_type="transfer", category="transfer",
               transfer_to_account_id=accounts["mortgage"].id, description="JPMORGAN CHASE CHASE ACH PPD")
    await _txn(db, org, user, checking, "816.53", 5, vendor="Toyota Financial Services",
               external_category="LOAN_PAYMENTS")
    # Paying off the card: its checking side, and the card's side.
    await _txn(db, org, user, checking, "200.00", 6, description="CHASE CREDIT CRD AUTOPAY",
               external_category="LOAN_PAYMENTS")
    await _txn(db, org, user, accounts["card"], "200.00", 7, transaction_type="income",
               category="uncategorized", external_category="LOAN_PAYMENTS")
    await _txn(db, org, user, accounts["card"], "200.00", 8, vendor="HEB", external_category="FOOD_AND_DRINK")
    await _txn(db, org, user, checking, "500.00", 9, transaction_type="transfer", category="transfer",
               transfer_to_account_id=accounts["savings"].id)
    # Interest the lender added to the mortgage balance.
    await _txn(db, org, user, accounts["mortgage"], "410.00", 10, description="INTEREST")
    # Not yet reviewed: Cash flow counts approved rows only.
    await _txn(db, org, user, checking, "75.00", 11, vendor="Shell", status="pending", is_manual=True,
               external_source=None, external_id=None)
    return accounts


class TestMortgagesAndLoans:
    async def test_untagged_payments_in_your_own_name_are_not_money_out(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _setup(db, test_org, test_user)
        with _session(db):
            month = await _october(test_org)
        # The Chase transfer, Toyota and HEB.
        assert (month.money_in_cents, month.money_out_cents) == (5000_00, 2139_79)
        assert month.mortgages_loans_cents == 1939_79

    async def test_a_tagged_payee_counts_on_the_mortgages_and_loans_line(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _setup(db, test_org, test_user)
        await loan_payee_repo.remember(
            db, organization_id=test_org.id, created_by_user_id=test_user.id, payee=TDECU, kind="mortgage",
        )
        await db.commit()
        with _session(db):
            month = await _october(test_org)
            expenses = await monthly_expense_service.get_monthly_expenses(
                organization_id=test_org.id, range_key="3m", scope="all", today=TODAY,
            )

        assert month.mortgages_loans_cents == 1939_79 + 3413_96 + 3168_19
        assert month.money_out_cents == month.mortgages_loans_cents + 200_00
        assert month.net_cents == 5000_00 - month.money_out_cents
        # Monthly expenses counts the same rows, plus the one still waiting
        # for review.
        october = {m.month: m.total_cents for m in expenses.months}["2026-10"]
        assert october == month.money_out_cents + 75_00
        labels = {c.label: c.total_cents for c in expenses.categories}
        assert labels["Mortgage"] == 1123_26 + 3413_96 + 3168_19
        assert labels["Car & other loans"] == 816_53

    async def test_narrowing_to_an_account_narrows_money_out(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        accounts = await _setup(db, test_org, test_user)
        with _session(db):
            card = await _october(test_org, accounts["card"].id)
            checking = await _october(test_org, accounts["checking"].id)
        assert (card.money_out_cents, card.mortgages_loans_cents) == (200_00, 0)
        assert (checking.money_out_cents, checking.mortgages_loans_cents) == (1939_79, 1939_79)
