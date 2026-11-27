"""Monthly expenses against a real (SQLite) database.

The ledger is shaped like a real one with every bank connected: card
purchases, a mortgage the bank calls a loan payment, two mortgages paid by
plain bank transfers the bank can't pair with the loan, a car loan, a card
payment with both its sides, moves between your own accounts, money sent to
yourself and to someone else, a lender's interest on the loan account, and
emailed receipts with no account.

Pinned: only the full months before this one count, averaged over every month
in the range; loan and mortgage payments count under their own headings; card
payments, own-account moves, money sent to yourself and loan interest never
count; once the bank history covers a day, a row with no account doesn't
count (the bank's row is that money) while a hand-typed row filed on an
account does; deleted and duplicate rows never count; the scope filter
narrows; another workspace's rows never show.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.mortgage.mortgage import Mortgage
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.spending_category import SpendingCategory
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.monthly_expenses import monthly_expense_service

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 11, 24)
OCT = 10


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(monthly_expense_service, "unit_of_work", _uow):
        yield


class _Ledger:
    def __init__(self, db: AsyncSession, org: Organization, user: User) -> None:
        self.db, self.org, self.user = db, org, user

    async def account(self, name: str, account_type: str, **overrides: object) -> FinancialAccount:
        account = FinancialAccount(
            id=uuid.uuid4(), organization_id=self.org.id, user_id=self.user.id,
            name=name, account_type=account_type, **overrides,
        )
        self.db.add(account)
        await self.db.commit()
        return account

    async def mortgage(self, principal: int, interest: int, escrow: int | None) -> Mortgage:
        prop = Property(id=uuid.uuid4(), organization_id=self.org.id, user_id=self.user.id, name=f"Home {principal}")
        self.db.add(prop)
        mortgage = Mortgage(
            id=uuid.uuid4(), organization_id=self.org.id, user_id=self.user.id, property_id=prop.id,
            rate_type="fixed", monthly_principal_cents=principal, monthly_interest_cents=interest,
            monthly_escrow_cents=escrow,
        )
        self.db.add(mortgage)
        await self.db.commit()
        return mortgage

    async def category(self, name: str) -> SpendingCategory:
        category = SpendingCategory(id=uuid.uuid4(), organization_id=self.org.id, name=name, is_default=False)
        self.db.add(category)
        await self.db.commit()
        return category

    async def txn(self, amount: str, day: int, *, month: int = OCT, bank: bool = True, **overrides: object) -> Transaction:
        values: dict[str, object] = {
            "id": uuid.uuid4(),
            "organization_id": self.org.id,
            "user_id": self.user.id,
            "transaction_date": _dt.date(2026, month, day),
            "tax_year": 2026,
            "amount": Decimal(amount),
            "transaction_type": "expense",
            "category": "other_expense",
            "transaction_scope": "personal",
            "status": "approved",
        }
        if bank:
            values.update(external_source="plaid", external_id=str(uuid.uuid4()))
        values.update(overrides)
        if values["transaction_type"] == "transfer":
            values["category"] = "transfer"
        if values["transaction_type"] == "income":
            values["category"] = "uncategorized"
        txn = Transaction(**values)
        self.db.add(txn)
        await self.db.commit()
        return txn


async def _ledger(db: AsyncSession, org: Organization, user: User) -> None:
    await db.execute(update(User).where(User.id == user.id).values(name="Jason Kwon"))
    await db.commit()
    book = _Ledger(db, org, user)
    checking = await book.account("TDECU Checking", "checking", institution_name="TDECU", mask="4821")
    savings = await book.account("TDECU Savings", "savings")
    card = await book.account("Chase Sapphire", "credit_card")
    car_loan = await book.account("Toyota loan", "loan")
    tdecu_loan = await book.account("TDECU Mortgage", "mortgage")
    await book.mortgage(1500_00, 700_00, 300_00)     # paid as $2,500.00
    await book.mortgage(2100_00, 900_00, 413_96)     # paid as $3,413.96
    await book.mortgage(2000_00, 1168_19, None)      # paid as $3,168.19
    groceries = await book.category("Groceries")

    on_checking = {"account_id": checking.id}
    # Spending.
    await book.txn("200.00", 3, account_id=card.id, spending_category_id=groceries.id, external_category="FOOD_AND_DRINK")
    await book.txn("50.00", 4, account_id=card.id, external_category="FOOD_AND_DRINK")
    # Typed in by hand, but filed on an account: it counts.
    await book.txn("150.00", 6, bank=False, category="maintenance", transaction_scope="rental", **on_checking)
    await book.txn(
        "120.00", 7, vendor="Zelle payment to Maria Lopez", description="Zelle payment to Maria Lopez",
        external_category="TRANSFER_OUT", **on_checking,
    )
    # Loans and mortgages.
    await book.txn("2500.00", 1, description="JPMORGAN CHASE CHASE ACH PPD ID: 123", external_category="LOAN_PAYMENTS", **on_checking)
    await book.txn("450.00", 2, description="Toyota Financial Services", external_category="LOAN_PAYMENTS", **on_checking)
    await book.txn(
        "3413.96", 5, description="Jason Kwon External F Jason Kwon WEB ID: 9", external_category="TRANSFER_OUT", **on_checking,
    )
    await book.txn(
        "3168.19", 5, transaction_type="transfer", description="Jason Kwon External F Jason Kwon WEB ID: 9",
        external_category="TRANSFER_OUT", **on_checking,
    )
    await book.txn("200.00", 9, transaction_type="transfer", transfer_to_account_id=car_loan.id, **on_checking)
    # Never spending.
    await book.txn("900.00", 10, description="Payment to Chase card ending in 1234", external_category="LOAN_PAYMENTS", **on_checking)
    await book.txn("900.00", 12, transaction_type="income", account_id=card.id, external_category="LOAN_PAYMENTS")
    await book.txn("300.00", 11, transaction_type="transfer", transfer_to_account_id=card.id, **on_checking)
    await book.txn("1000.00", 11, transaction_type="transfer", transfer_to_account_id=savings.id, **on_checking)
    await book.txn("500.00", 13, description="Jason Kwon (Sent)", external_category="TRANSFER_OUT", **on_checking)
    await book.txn("800.00", 15, account_id=tdecu_loan.id, external_category="LOAN_PAYMENTS")
    await book.txn("9.00", 16, deleted_at=_dt.datetime(2026, 10, 20, tzinfo=_dt.timezone.utc), **on_checking)
    await book.txn("8.00", 16, status="duplicate", **on_checking)
    # The bank history covers these days, so an emailed row with no account
    # never counts: the bank's row is the money.
    await book.txn("60.00", 12, bank=False)
    await book.txn("60.00", 14, account_id=card.id, external_category="FOOD_AND_DRINK")
    await book.txn("40.00", 20, bank=False)
    await book.txn("40.00", 20, **on_checking)
    await book.txn("40.00", 21, **on_checking)
    await book.txn("25.00", 5, bank=False)
    await book.txn("75.00", 6, bank=False, category="maintenance")
    # Outside the six full months: this month, and April.
    await book.txn("7000.00", 2, month=11, **on_checking)
    await book.txn("7000.00", 15, month=4, **on_checking)


async def test_averages_every_account_over_the_full_months(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    await _ledger(db, test_org, test_user)
    other_org = Organization(id=uuid.uuid4(), name="Elsewhere", created_by=test_user.id)
    db.add(other_org)
    await db.commit()
    await _Ledger(db, other_org, test_user).txn("999.00", 3)

    with _session(db):
        result = await monthly_expense_service.get_monthly_expenses(
            organization_id=test_org.id, range_key="6m", scope="all", today=TODAY,
        )

    assert [m.month for m in result.months] == ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]
    assert [m.total_cents for m in result.months] == [0, 0, 0, 0, 0, 10_392_15]
    assert result.total_cents == 10_392_15
    assert result.average_cents == 1_732_03
    assert result.bank_history_start == _dt.date(2026, 4, 15)
    assert [(c.label, c.total_cents) for c in result.categories] == [
        ("Mortgage", 9_082_15),
        ("Car & other loans", 650_00),
        ("Groceries", 200_00),
        ("Repairs & maintenance", 150_00),
        ("Money sent to people", 120_00),
        ("Food & dining", 110_00),
        ("Other", 80_00),
    ]
    mortgage = result.categories[0]
    assert mortgage.average_cents == 1_513_69
    assert mortgage.share_percent == 87.4


async def test_a_headings_payments_are_exactly_the_ones_it_counts(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    await _ledger(db, test_org, test_user)
    with _session(db):
        summary = await monthly_expense_service.get_monthly_expenses(
            organization_id=test_org.id, range_key="6m", scope="all", today=TODAY,
        )
        details = {
            c.label: await monthly_expense_service.get_category_detail(
                organization_id=test_org.id, range_key="6m", scope="all", label=c.label, today=TODAY,
            )
            for c in summary.categories
        }

    for category in summary.categories:
        detail = details[category.label]
        assert detail.total_cents == category.total_cents
        assert sum(t.amount_cents for t in detail.transactions) == category.total_cents
        assert sum(p.total_cents for p in detail.payees) == category.total_cents
    mortgage = details["Mortgage"]
    assert [t.date.day for t in mortgage.transactions] == [5, 5, 1]
    assert sorted(t.amount_cents for t in mortgage.transactions) == [2500_00, 3168_19, 3413_96]
    sent = details["Money sent to people"].transactions
    assert [(t.payee, t.account_name, t.account_institution, t.account_mask) for t in sent] == [
        ("Maria Lopez", "TDECU Checking", "TDECU", "4821"),
    ]
    # The emailed $60 receipt is not listed beside the bank's.
    assert [t.amount_cents for t in details["Food & dining"].transactions] == [60_00, 50_00]
    assert [t.account_name for t in details["Food & dining"].transactions] == ["Chase Sapphire", "Chase Sapphire"]


async def test_the_scope_filter_narrows_to_that_money(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    await _ledger(db, test_org, test_user)
    with _session(db):
        result = await monthly_expense_service.get_monthly_expenses(
            organization_id=test_org.id, range_key="3m", scope="rental", today=TODAY,
        )
    assert [m.month for m in result.months] == ["2026-08", "2026-09", "2026-10"]
    assert result.total_cents == 150_00
    assert result.average_cents == 50_00
    assert [c.label for c in result.categories] == ["Repairs & maintenance"]


async def test_an_unknown_range_or_scope_is_refused() -> None:
    with pytest.raises(monthly_expense_service.InvalidMonthlyExpenseRangeError):
        await monthly_expense_service.get_monthly_expenses(
            organization_id=uuid.uuid4(), range_key="5y", scope="all", today=TODAY,
        )
    with pytest.raises(monthly_expense_service.InvalidMonthlyExpenseScopeError):
        await monthly_expense_service.get_monthly_expenses(
            organization_id=uuid.uuid4(), range_key="6m", scope="everything", today=TODAY,
        )
