"""Importing a bank CSV into a chosen financial account.

The dedupe key of a CSV row is its date, amount and description, which is
unique within one account but not across two. Pinned here, against every
combination of keys:

* same line, same account, imported twice — skipped the second time;
* same line, two different accounts — imported into both;
* same line, first imported with no account, re-imported into an account —
  skipped (the row already exists; importing it again would double it);
* no account chosen — unchanged from before accounts existed;
* someone else's account — refused before anything is written.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from unittest.mock import patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.transactions import import_service
from app.services.transactions.foreign_reference_error import ForeignReferenceError

pytestmark = pytest.mark.asyncio

_CSV = (
    b"Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\n"
    b"DEBIT,08/01/2026,MONTHLY SERVICE FEE,-12.00,FEE_TRANSACTION,1000.00,\n"
)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(import_service, "unit_of_work", _uow):
        yield


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


async def _account(db: AsyncSession, org: Organization, user_id: uuid.UUID, name: str) -> FinancialAccount:
    account = FinancialAccount(
        organization_id=org.id, user_id=user_id, name=name, account_type="checking",
    )
    db.add(account)
    await db.commit()
    return account


async def _import(db: AsyncSession, ctx: RequestContext, account_id: uuid.UUID | None):
    with _session(db):
        return await import_service.import_bank_csv_file(ctx, _CSV, "chase.csv", None, account_id)


async def _rows(db: AsyncSession) -> list[Transaction]:
    return list((await db.execute(select(Transaction))).scalars().all())


async def test_rows_land_in_the_chosen_account(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    checking = await _account(db, test_org, test_user.id, "Chase Checking")

    result = await _import(db, _ctx(test_org, test_user), checking.id)

    assert result.imported == 1
    [row] = await _rows(db)
    assert row.account_id == checking.id
    assert row.external_id is not None and row.external_id.startswith(f"{checking.id}:")


async def test_same_account_twice_is_skipped(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    checking = await _account(db, test_org, test_user.id, "Chase Checking")
    ctx = _ctx(test_org, test_user)

    await _import(db, ctx, checking.id)
    second = await _import(db, ctx, checking.id)

    assert (second.imported, second.skipped_duplicates) == (0, 1)
    assert len(await _rows(db)) == 1


async def test_the_same_line_in_two_accounts_is_two_transactions(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    first = await _account(db, test_org, test_user.id, "Chase Checking")
    second = await _account(db, test_org, test_user.id, "TDECU Checking")
    ctx = _ctx(test_org, test_user)

    await _import(db, ctx, first.id)
    result = await _import(db, ctx, second.id)

    assert result.imported == 1
    assert {row.account_id for row in await _rows(db)} == {first.id, second.id}


async def test_a_file_first_imported_without_an_account_is_not_imported_again(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    checking = await _account(db, test_org, test_user.id, "Chase Checking")
    ctx = _ctx(test_org, test_user)

    await _import(db, ctx, None)
    result = await _import(db, ctx, checking.id)

    assert (result.imported, result.skipped_duplicates) == (0, 1)
    [row] = await _rows(db)
    assert row.account_id is None


async def test_no_account_keeps_the_old_key(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    await _import(db, _ctx(test_org, test_user), None)

    [row] = await _rows(db)
    assert row.account_id is None
    assert row.external_id is not None and ":" not in row.external_id


async def test_someone_else_s_account_is_refused(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    theirs = await _account(db, test_org, uuid.uuid4(), "Teammate checking")

    with pytest.raises(ForeignReferenceError, match="account_id"):
        await _import(db, _ctx(test_org, test_user), theirs.id)

    count = (await db.execute(select(func.count()).select_from(Transaction))).scalar_one()
    assert count == 0
