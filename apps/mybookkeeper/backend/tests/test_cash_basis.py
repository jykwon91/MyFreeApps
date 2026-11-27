"""Cash flow on a cash basis, against a real (SQLite) database.

Shaped like the case that overstated the operator's month: Vello emails a
statement per property (income, no account) and pays the net into checking a
few days later, for a different amount. An emailed AT&T bill is paid by the
card weeks after the bill's date.

Pinned, for the bank history start: a Plaid row and a bank CSV row in an
account start it, a deleted one included; a hand-typed row on an account, a
bank row with no account and another workspace's rows don't. For the page:
with no bank feed every row counts; from the history start only rows in an
account count — a statement or bill with no account doesn't, a hand-typed
row filed on an account does — and before it every row counts; narrowing to
an account is unchanged.
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
from app.repositories.cash_flow import cash_basis
from app.services.cash_flow import cash_flow_service

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 11, 20)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(cash_flow_service, "unit_of_work", _uow):
        yield


async def _account(db: AsyncSession, org: Organization, user: User, name: str, account_type: str) -> FinancialAccount:
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name=name, account_type=account_type,
    )
    db.add(account)
    await db.commit()
    return account


async def _txn(
    db: AsyncSession, org: Organization, user: User, amount: str, day: _dt.date, **overrides: object,
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
    }
    values.update(overrides)
    txn = Transaction(**values)
    db.add(txn)
    await db.commit()
    return txn


def _plaid(account: FinancialAccount) -> dict[str, object]:
    return {"account_id": account.id, "external_source": "plaid", "external_id": str(uuid.uuid4())}


async def _flow(org: Organization, account_id: uuid.UUID | None = None):
    return await cash_flow_service.get_cash_flow(
        organization_id=org.id, range_key="6m", scope="all", account_id=account_id, today=TODAY,
    )


async def _vello_and_att(db: AsyncSession, org: Organization, user: User) -> None:
    """The statements, the bill and a manual cash entry — none with an account."""
    for day in (_dt.date(2026, 10, 1), _dt.date(2026, 10, 16)):
        await _txn(db, org, user, "2400.00", day, vendor="Vello", transaction_type="income",
                   category="rental_revenue", transaction_scope="rental")
    await _txn(db, org, user, "95.40", _dt.date(2026, 10, 2), vendor="AT&T", category="utilities")


class TestBankHistoryStart:
    async def test_a_bank_feed_row_in_an_account_starts_it(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        checking = await _account(db, test_org, test_user, "Chase", "checking")
        assert await cash_basis.bank_history_start(db, organization_id=test_org.id) is None

        # None of these is a bank feed in an account.
        await _txn(db, test_org, test_user, "5.00", _dt.date(2025, 1, 1), account_id=checking.id, is_manual=True)
        await _txn(db, test_org, test_user, "5.00", _dt.date(2025, 2, 1), external_source="plaid", external_id="x1")
        other = Organization(id=uuid.uuid4(), name="Elsewhere", created_by=test_user.id)
        db.add(other)
        await db.commit()
        foreign = await _account(db, other, test_user, "Theirs", "checking")
        await _txn(db, other, test_user, "5.00", _dt.date(2025, 3, 1), **_plaid(foreign))
        assert await cash_basis.bank_history_start(db, organization_id=test_org.id) is None

        await _txn(db, test_org, test_user, "5.00", _dt.date(2026, 5, 10), **_plaid(checking))
        await _txn(db, test_org, test_user, "5.00", _dt.date(2026, 6, 1), account_id=checking.id,
                   external_source="bank_csv", external_id="c1")
        assert await cash_basis.bank_history_start(db, organization_id=test_org.id) == _dt.date(2026, 5, 10)

        await _txn(db, test_org, test_user, "5.00", _dt.date(2026, 4, 2), account_id=checking.id,
                   external_source="bank_csv", external_id="c2",
                   deleted_at=_dt.datetime(2026, 4, 3, tzinfo=_dt.timezone.utc))
        assert await cash_basis.bank_history_start(db, organization_id=test_org.id) == _dt.date(2026, 4, 2)


class TestCashFlowOnACashBasis:
    async def test_with_no_bank_feed_every_row_counts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _vello_and_att(db, test_org, test_user)
        with _session(db):
            flow = await _flow(test_org)
        assert flow.bank_history_start is None
        assert (flow.totals.money_in_cents, flow.totals.money_out_cents) == (4800_00, 95_40)

    async def test_from_the_history_start_only_money_through_an_account_counts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        checking = await _account(db, test_org, test_user, "Chase checking", "checking")
        card = await _account(db, test_org, test_user, "Chase card", "credit_card")
        cash = await _account(db, test_org, test_user, "Wallet", "cash")
        await _vello_and_att(db, test_org, test_user)
        # What the bank shows for the same money: two net payouts, the autopay.
        for day, amount in ((_dt.date(2026, 10, 3), "2113.50"), (_dt.date(2026, 10, 18), "1987.25")):
            await _txn(db, test_org, test_user, amount, day, vendor="VELLO LLC", transaction_type="income",
                       category="uncategorized", transaction_scope="rental", **_plaid(checking))
        await _txn(db, test_org, test_user, "95.40", _dt.date(2026, 10, 24), vendor="ATT", **_plaid(card))
        # Paid in cash and filed on the cash account, by hand.
        await _txn(db, test_org, test_user, "60.00", _dt.date(2026, 10, 9), account_id=cash.id, is_manual=True)
        # Before the bank history starts: no bank row stands in for it.
        await _txn(db, test_org, test_user, "300.00", _dt.date(2026, 6, 5), vendor="Pest control")
        await _txn(db, test_org, test_user, "10.00", _dt.date(2026, 6, 20), **_plaid(card))

        with _session(db):
            flow = await _flow(test_org)
            on_checking = await _flow(test_org, checking.id)

        assert flow.bank_history_start == _dt.date(2026, 6, 20)
        assert (flow.totals.money_in_cents, flow.totals.money_out_cents) == (4100_75, 465_40)
        by_month = {m.month: (m.money_in_cents, m.money_out_cents) for m in flow.months}
        assert by_month["2026-06"] == (0, 310_00)
        assert by_month["2026-10"] == (4100_75, 155_40)
        assert (on_checking.totals.money_in_cents, on_checking.totals.money_out_cents) == (4100_75, 0)
