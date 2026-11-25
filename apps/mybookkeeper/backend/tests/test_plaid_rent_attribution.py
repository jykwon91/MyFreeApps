"""Synced income from a tenant is filed as their rent; other senders are
queued for rent review — through a real sync (SQLite), Plaid mocked at the
client seam.

Pinned here: a Zelle (Chase) or Wise payment from a lease-signed tenant is
filed as rent with that tenant, on the rents line and in rental scope; a
learned payer alias files it too; an unknown sender is queued once (a second
sync doesn't queue it again); rows a sync stored before this existed are
triaged on the next sync; and expenses, rows the person already filed, and
rows that name no person are left alone.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.organization.organization import Organization
from app.models.transactions.rent_attribution_review_queue import RentAttributionReviewQueue
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import payer_alias_repo
from app.schemas.plaid.plaid_sync_batch import PlaidSyncBatch
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.services.plaid import plaid_sync_service as svc

pytestmark = pytest.mark.asyncio

_CLIENT = "app.services.plaid.plaid_sync_service.plaid_client.sync_transactions"
_DAY = _dt.date(2026, 11, 16)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


def _batch(added: list[PlaidWireTransaction] | None = None) -> PlaidSyncBatch:
    return PlaidSyncBatch(added=added or [], modified=[], removed=[], accounts=[], next_cursor="c")


def _income(transaction_id: str, name: str, amount: str = "338.50") -> PlaidWireTransaction:
    # Plaid signs money in as negative.
    return PlaidWireTransaction(
        transaction_id=transaction_id, account_id="plaid-checking",
        amount=-Decimal(amount), date=_DAY, name=name, pending=False,
    )


async def _connection(db: AsyncSession, org: Organization, user: User) -> PlaidItem:
    item = PlaidItem(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        plaid_item_id=f"item-{uuid.uuid4()}", institution_name="Chase", status="active",
    )
    item.access_token = "access-sandbox-secret"
    db.add(item)
    await db.flush()
    db.add(FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name="Checking",
        account_type="checking", plaid_item_id=item.id, plaid_account_id="plaid-checking",
        default_transaction_scope="personal",
    ))
    await db.commit()
    return item


async def _tenant(db: AsyncSession, org: Organization, user: User, name: str) -> Applicant:
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        stage="lease_signed", legal_name=name,
    )
    db.add(applicant)
    await db.commit()
    return applicant


async def _sync(db: AsyncSession, item: PlaidItem, batch: PlaidSyncBatch) -> None:
    with _session(db), patch(_CLIENT, AsyncMock(return_value=batch)):
        await svc.sync_item(item.id)


async def _row(db: AsyncSession, org: Organization, external_id: str) -> Transaction:
    result = await db.execute(
        select(Transaction)
        .where(Transaction.organization_id == org.id, Transaction.external_id == external_id)
        .execution_options(populate_existing=True),
    )
    return result.scalar_one()


async def _queued(db: AsyncSession, txn: Transaction) -> list[RentAttributionReviewQueue]:
    result = await db.execute(
        select(RentAttributionReviewQueue).where(RentAttributionReviewQueue.transaction_id == txn.id),
    )
    return list(result.scalars().all())


async def test_a_chase_zelle_from_a_tenant_is_filed_as_their_rent(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _connection(db, test_org, test_user)
    tenant = await _tenant(db, test_org, test_user, "Sonu King")

    await _sync(db, item, _batch([_income("z1", "Zelle payment from SONU KING 31731713019")]))

    row = await _row(db, test_org, "z1")
    assert row.applicant_id == tenant.id
    assert row.payer_name == "Sonu King"
    assert row.attribution_source == "auto_exact"
    assert row.category == "rental_revenue"
    assert row.tax_relevant is True
    assert row.schedule_e_line == "line_3_rents_received"
    assert row.transaction_scope == "rental"
    assert await _queued(db, row) == []


async def test_a_wise_payment_from_a_tenant_is_filed_as_their_rent(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _connection(db, test_org, test_user)
    tenant = await _tenant(db, test_org, test_user, "Nicole Santos Felix")

    await _sync(db, item, _batch([_income("w1", "Nicole Santos Felix ()", "600")]))

    row = await _row(db, test_org, "w1")
    assert row.applicant_id == tenant.id
    assert row.category == "rental_revenue"


async def test_a_learned_alias_files_a_relative_paying_rent(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _connection(db, test_org, test_user)
    tenant = await _tenant(db, test_org, test_user, "Prince Kapoor")
    await payer_alias_repo.upsert(
        db, user_id=test_user.id, organization_id=test_org.id,
        payer_name="Tushar Kapoor", applicant_id=tenant.id, source="manual_link",
    )
    await db.commit()

    await _sync(db, item, _batch([_income("a1", "Zelle payment from TUSHAR KAPOOR 99881")]))

    row = await _row(db, test_org, "a1")
    assert row.applicant_id == tenant.id
    assert row.attribution_source == "auto_alias"


async def test_an_unknown_sender_is_queued_for_review_once(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _connection(db, test_org, test_user)
    await _tenant(db, test_org, test_user, "Sonu King")

    await _sync(db, item, _batch([_income("u1", "Zelle payment from JANE STRANGER 123")]))
    await _sync(db, item, _batch())

    row = await _row(db, test_org, "u1")
    assert row.applicant_id is None
    assert row.category == "uncategorized"
    assert row.payer_name == "Jane Stranger"
    queued = await _queued(db, row)
    assert [q.confidence for q in queued] == ["unmatched"]


async def test_a_near_match_is_proposed_for_review_not_filed(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _connection(db, test_org, test_user)
    tenant = await _tenant(db, test_org, test_user, "Sonu King")

    await _sync(db, item, _batch([_income("f1", "Zelle payment from SONU KINGS 123")]))

    row = await _row(db, test_org, "f1")
    assert row.applicant_id is None
    queued = await _queued(db, row)
    assert [(q.confidence, q.proposed_applicant_id) for q in queued] == [("fuzzy", tenant.id)]


async def test_rows_synced_before_are_triaged_on_the_next_sync(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _connection(db, test_org, test_user)
    await _sync(db, item, _batch([_income("old1", "Zelle payment from SONU KING 31731713019")]))
    assert (await _row(db, test_org, "old1")).applicant_id is None
    # Nothing to match yet: read once, queued as unmatched. Mimic a row stored
    # before attribution existed by clearing what the read stored.
    old = await _row(db, test_org, "old1")
    old.payer_name = None
    for queued in await _queued(db, old):
        await db.delete(queued)
    await db.commit()
    tenant = await _tenant(db, test_org, test_user, "Sonu King")

    await _sync(db, item, _batch())

    assert (await _row(db, test_org, "old1")).applicant_id == tenant.id


async def test_rows_that_are_not_a_tenant_paying_are_left_alone(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _connection(db, test_org, test_user)
    await _tenant(db, test_org, test_user, "Sonu King")
    spent = PlaidWireTransaction(
        transaction_id="e1", account_id="plaid-checking", amount=Decimal("338.50"),
        date=_DAY, name="Zelle payment to SONU KING 5551", pending=False,
    )
    await _sync(db, item, _batch([spent, _income("i1", "Interest Payment (Savings)")]))

    for external_id in ("e1", "i1"):
        row = await _row(db, test_org, external_id)
        assert row.applicant_id is None
        assert row.payer_name is None
        assert await _queued(db, row) == []


async def test_a_row_the_person_already_filed_is_left_alone(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _connection(db, test_org, test_user)
    await _sync(db, item, _batch([_income("p1", "Zelle payment from SONU KING 31731713019")]))
    filed = await _row(db, test_org, "p1")
    filed.payer_name = None
    filed.category = "business_income"
    for queued in await _queued(db, filed):
        await db.delete(queued)
    await db.commit()
    await _tenant(db, test_org, test_user, "Sonu King")

    await _sync(db, item, _batch())

    row = await _row(db, test_org, "p1")
    assert row.applicant_id is None
    assert row.category == "business_income"
