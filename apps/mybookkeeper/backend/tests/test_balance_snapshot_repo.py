"""``balance_snapshot_repo`` against a real (SQLite) database.

Pinned: an upsert that loses a race to another writer updates the winner's
row instead of failing; the unique indexes refuse a second row for the same
source and day (account, loan record, property per person) and allow the
other combinations; the carry-in query returns each source's latest row
before a date; owners are everyone with something that counts.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.net_worth_constants import SOURCE_ACCOUNT
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.net_worth.balance_snapshot import BalanceSnapshot
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.net_worth import balance_snapshot_repo

pytestmark = pytest.mark.asyncio

_DAY = _dt.date(2026, 11, 24)


def _row(org: Organization, user_id: uuid.UUID, day: _dt.date = _DAY, **source: uuid.UUID) -> BalanceSnapshot:
    return BalanceSnapshot(
        organization_id=org.id, user_id=user_id, snapshot_date=day, balance_cents=1, **source,
    )


async def test_an_upsert_that_loses_the_race_updates_the_winning_row(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account_id = uuid.uuid4()
    db.add(_row(test_org, test_user.id, financial_account_id=account_id))
    await db.commit()

    real_find = balance_snapshot_repo._find
    # The first lookup misses, as if the other writer committed just after it.
    with patch.object(balance_snapshot_repo, "_find", AsyncMock(side_effect=[None, await real_find(
        db, organization_id=test_org.id, user_id=test_user.id, snapshot_date=_DAY,
        source=SOURCE_ACCOUNT, source_id=account_id,
    )])):
        await balance_snapshot_repo.upsert(
            db, organization_id=test_org.id, user_id=test_user.id, snapshot_date=_DAY,
            source=SOURCE_ACCOUNT, source_id=account_id, balance_cents=77,
        )
    await db.commit()
    rows = (await db.execute(select(BalanceSnapshot))).scalars().all()
    assert [r.balance_cents for r in rows] == [77]


@pytest.mark.parametrize("column", ["financial_account_id", "mortgage_id"])
async def test_one_row_per_account_or_loan_per_day(
    db: AsyncSession, test_user: User, test_org: Organization, column: str,
) -> None:
    source_id = uuid.uuid4()
    db.add(_row(test_org, test_user.id, **{column: source_id}))
    db.add(_row(test_org, test_user.id, _DAY - _dt.timedelta(days=1), **{column: source_id}))
    db.add(_row(test_org, test_user.id, **{column: uuid.uuid4()}))
    await db.commit()
    db.add(_row(test_org, test_user.id, **{column: source_id}))
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()


async def test_one_row_per_property_per_person_per_day(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    prop_id = uuid.uuid4()
    db.add(_row(test_org, test_user.id, property_id=prop_id))
    db.add(_row(test_org, uuid.uuid4(), property_id=prop_id))
    await db.commit()
    db.add(_row(test_org, test_user.id, property_id=prop_id))
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()


async def test_a_row_naming_two_sources_is_refused(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    db.add(_row(test_org, test_user.id, financial_account_id=uuid.uuid4(), property_id=uuid.uuid4()))
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()


async def test_carry_in_is_each_sources_latest_row_before_the_date(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    for days_back, source in ((10, a), (5, a), (1, a), (7, b)):
        db.add(_row(test_org, test_user.id, _DAY - _dt.timedelta(days=days_back), financial_account_id=source))
    db.add(_row(test_org, uuid.uuid4(), _DAY - _dt.timedelta(days=3), financial_account_id=uuid.uuid4()))
    await db.commit()

    rows = await balance_snapshot_repo.list_latest_before(
        db, organization_id=test_org.id, user_id=test_user.id, before=_DAY - _dt.timedelta(days=2),
    )
    found = {(r.financial_account_id, r.snapshot_date) for r in rows}
    assert found == {(a, _DAY - _dt.timedelta(days=5)), (b, _DAY - _dt.timedelta(days=7))}


async def test_owners_are_everyone_with_a_live_account(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    db.add(FinancialAccount(
        organization_id=test_org.id, user_id=test_user.id, name="Checking", account_type="checking",
    ))
    db.add(FinancialAccount(
        organization_id=test_org.id, user_id=uuid.uuid4(), name="Gone", account_type="checking",
        deleted_at=_dt.datetime.now(_dt.timezone.utc),
    ))
    await db.commit()
    assert await balance_snapshot_repo.list_owners(db) == [(test_org.id, test_user.id)]
