"""Tagging a transaction's payee as a mortgage or a loan, against the database.

Pinned: tagging remembers the payee as Monthly expenses names it, once per
workspace whatever the capitals; tagging again changes the kind; untagging
forgets it and is harmless twice; money in and a payment that names nobody
can't be tagged; a deleted or another workspace's transaction is not found.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.transactions.loan_payee import LoanPayee
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.transactions import loan_payee_service

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _session(db: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(loan_payee_service, "unit_of_work", _uow):
        yield


async def _txn(db: AsyncSession, org: Organization, user: User, **overrides: object) -> Transaction:
    values: dict[str, object] = {
        "id": uuid.uuid4(), "organization_id": org.id, "user_id": user.id,
        "transaction_date": _dt.date(2026, 10, 2), "tax_year": 2026, "amount": Decimal("1123.26"),
        "transaction_type": "expense", "category": "other_expense", "status": "approved",
        "description": "JPMORGAN CHASE CHASE ACH PPD",
    }
    values.update(overrides)
    txn = Transaction(**values)
    db.add(txn)
    await db.commit()
    return txn


async def _payees(db: AsyncSession, org: Organization) -> list[tuple[str, str]]:
    result = await db.execute(
        select(LoanPayee.normalized_payee, LoanPayee.kind).where(LoanPayee.organization_id == org.id),
    )
    return list(result.tuples().all())


async def test_tag_remembers_the_payee_once_and_retagging_changes_the_kind(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    first = await _txn(db, test_org, test_user)
    second = await _txn(db, test_org, test_user, description="jpmorgan chase  CHASE ACH PPD")

    before = await loan_payee_service.get_for_transaction(transaction_id=first.id, organization_id=test_org.id)
    assert (before.payee, before.kind, before.can_tag) == ("JPMORGAN CHASE CHASE ACH PPD", None, True)

    tagged = await loan_payee_service.tag(
        transaction_id=first.id, organization_id=test_org.id, user_id=test_user.id, kind="loan",
    )
    assert tagged.kind == "loan"
    # The other payment to the same payee reads as tagged too.
    other = await loan_payee_service.get_for_transaction(transaction_id=second.id, organization_id=test_org.id)
    assert other.kind == "loan"

    await loan_payee_service.tag(
        transaction_id=second.id, organization_id=test_org.id, user_id=test_user.id, kind="mortgage",
    )
    assert await _payees(db, test_org) == [("jpmorgan chase chase ach ppd", "mortgage")]


async def test_untag_forgets_the_payee_and_is_harmless_twice(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    txn = await _txn(db, test_org, test_user)
    await loan_payee_service.tag(
        transaction_id=txn.id, organization_id=test_org.id, user_id=test_user.id, kind="mortgage",
    )
    for _ in range(2):
        result = await loan_payee_service.untag(transaction_id=txn.id, organization_id=test_org.id)
        assert (result.kind, result.can_tag) == (None, True)
    assert await _payees(db, test_org) == []


async def test_money_in_and_a_nameless_payment_cannot_be_tagged(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    income = await _txn(db, test_org, test_user, transaction_type="income", category="uncategorized")
    nameless = await _txn(db, test_org, test_user, description=None, vendor=None)
    for txn in (income, nameless):
        read = await loan_payee_service.get_for_transaction(transaction_id=txn.id, organization_id=test_org.id)
        assert read.can_tag is False
        with pytest.raises(loan_payee_service.NotALoanPaymentError):
            await loan_payee_service.tag(
                transaction_id=txn.id, organization_id=test_org.id, user_id=test_user.id, kind="loan",
            )
    assert await _payees(db, test_org) == []


async def test_a_deleted_or_another_workspaces_transaction_is_not_found(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    deleted = await _txn(db, test_org, test_user, deleted_at=_dt.datetime(2026, 10, 3, tzinfo=_dt.timezone.utc))
    mine = await _txn(db, test_org, test_user)
    with pytest.raises(loan_payee_service.TransactionNotFoundError):
        await loan_payee_service.get_for_transaction(transaction_id=deleted.id, organization_id=test_org.id)
    with pytest.raises(loan_payee_service.TransactionNotFoundError):
        await loan_payee_service.tag(
            transaction_id=mine.id, organization_id=uuid.uuid4(), user_id=test_user.id, kind="loan",
        )
