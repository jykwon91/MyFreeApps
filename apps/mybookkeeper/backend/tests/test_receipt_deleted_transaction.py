"""Deleting a rent payment drops its pending receipt.

A deleted payment must leave the pending list and its badge count, and a send
for it must be refused — the host removed that payment, so the tenant must not
be emailed a receipt for it.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import transaction_repo
from app.schemas.leases.receipt_response import PendingReceiptListResponse
from app.services.leases import receipt_send_service, receipt_service
from app.services.leases.exceptions import ReceiptDismissedError
from tests.receipt_seed import CLIENT_TODAY, PERIOD_END, PERIOD_START, seed_receipt

pytestmark = pytest.mark.usefixtures("receipt_sessions")


async def _listing(org: Organization, user: User) -> PendingReceiptListResponse:
    return await receipt_service.get_pending_receipt_list(
        organization_id=org.id, user_id=user.id, limit=100, offset=0,
    )


async def _send(org: Organization, user: User, txn_id: uuid.UUID):  # type: ignore[no-untyped-def]
    return await receipt_send_service.send_receipt(
        transaction_id=txn_id,
        organization_id=org.id,
        user_id=user.id,
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        payment_method=None,
        today=CLIENT_TODAY,
    )


async def _receipt_status(db: AsyncSession, txn_id: uuid.UUID) -> str:
    db.expire_all()
    return (await db.execute(
        select(PendingRentReceipt.status).where(PendingRentReceipt.transaction_id == txn_id)
    )).scalar_one()


async def _soft_delete_behind_the_receipts_back(db: AsyncSession, txn_id: uuid.UUID) -> None:
    """Delete the payment without going through the repo, leaving its receipt open."""
    await db.execute(
        update(Transaction)
        .where(Transaction.id == txn_id)
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    await db.commit()


@pytest.mark.asyncio
async def test_single_delete_removes_receipt_from_list_and_count(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    gone = await seed_receipt(db, org=test_org, user=test_user)
    kept = await seed_receipt(db, org=test_org, user=test_user, with_integration=False)

    txn = await db.get(Transaction, gone)
    assert txn is not None
    await transaction_repo.mark_deleted(db, txn)
    await db.commit()

    listing = await _listing(test_org, test_user)
    assert [r.transaction_id for r in listing.items] == [kept]
    assert listing.total == listing.pending_count == 1
    assert await _receipt_status(db, gone) == "dismissed"
    assert await _receipt_status(db, kept) == "pending"


@pytest.mark.asyncio
async def test_bulk_delete_removes_receipts_from_list_and_count(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    first = await seed_receipt(db, org=test_org, user=test_user)
    second = await seed_receipt(db, org=test_org, user=test_user, with_integration=False)
    kept = await seed_receipt(db, org=test_org, user=test_user, with_integration=False)

    deleted = await transaction_repo.bulk_delete(db, [first, second], test_org.id)
    await db.commit()

    assert set(deleted) == {first, second}
    listing = await _listing(test_org, test_user)
    assert [r.transaction_id for r in listing.items] == [kept]
    assert listing.total == listing.pending_count == 1
    assert await _receipt_status(db, first) == "dismissed"
    assert await _receipt_status(db, second) == "dismissed"


@pytest.mark.asyncio
async def test_duplicate_resolution_drops_the_deleted_payments_receipt(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    duplicate = await seed_receipt(db, org=test_org, user=test_user)
    kept = await seed_receipt(db, org=test_org, user=test_user, with_integration=False)

    locked = await transaction_repo.lock_live_transactions(db, [duplicate], test_org.id)
    await transaction_repo.soft_delete_transactions(db, locked)
    await db.commit()

    listing = await _listing(test_org, test_user)
    assert [r.transaction_id for r in listing.items] == [kept]
    assert await _receipt_status(db, duplicate) == "dismissed"


@pytest.mark.asyncio
async def test_delete_leaves_a_receipt_mid_send_alone(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    txn_id = await seed_receipt(db, org=test_org, user=test_user)
    await db.execute(
        update(PendingRentReceipt)
        .where(PendingRentReceipt.transaction_id == txn_id)
        .values(
            status="sending",
            send_message_id="<m@x>",
            send_claimed_at=_dt.datetime.now(_dt.timezone.utc),
        )
    )
    await db.commit()

    txn = await db.get(Transaction, txn_id)
    assert txn is not None
    await transaction_repo.mark_deleted(db, txn)
    await db.commit()

    assert await _receipt_status(db, txn_id) == "sending"


@pytest.mark.asyncio
async def test_list_and_count_skip_a_deleted_payments_open_receipt(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    """Defence in depth: an open receipt whose payment is deleted is not listed or counted."""
    gone = await seed_receipt(db, org=test_org, user=test_user)
    await seed_receipt(db, org=test_org, user=test_user, with_integration=False)
    await _soft_delete_behind_the_receipts_back(db, gone)

    listing = await _listing(test_org, test_user)

    assert gone not in {r.transaction_id for r in listing.items}
    assert listing.total == listing.pending_count == len(listing.items) == 1


@pytest.mark.asyncio
async def test_send_for_a_dismissed_deleted_payment_is_refused(
    db: AsyncSession, test_org: Organization, test_user: User, receipt_gmail_send,  # type: ignore[no-untyped-def]
) -> None:
    txn_id = await seed_receipt(db, org=test_org, user=test_user)
    txn = await db.get(Transaction, txn_id)
    assert txn is not None
    await transaction_repo.mark_deleted(db, txn)
    await db.commit()

    with pytest.raises(ReceiptDismissedError):
        await _send(test_org, test_user, txn_id)

    receipt_gmail_send.assert_not_called()


@pytest.mark.asyncio
async def test_send_refuses_a_deleted_payment_even_if_its_receipt_is_still_open(
    db: AsyncSession, test_org: Organization, test_user: User, receipt_gmail_send,  # type: ignore[no-untyped-def]
) -> None:
    txn_id = await seed_receipt(db, org=test_org, user=test_user)
    await _soft_delete_behind_the_receipts_back(db, txn_id)

    with pytest.raises(LookupError):
        await _send(test_org, test_user, txn_id)

    receipt_gmail_send.assert_not_called()
    assert await _receipt_status(db, txn_id) == "pending"
