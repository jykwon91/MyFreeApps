"""The pending receipt list says up front what a send would refuse.

Each row carries the payment and tenant facts the host needs, plus a
``send_blocker``; the list carries the Gmail state. Every blocker is checked
against ``send_receipt`` on the same data, so the two can't disagree.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.integrations.integration import Integration
from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.models.leases.signed_lease import SignedLease
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.schemas.leases.receipt_response import (
    PendingReceiptListResponse,
    PendingReceiptResponse,
)
from app.services.leases import receipt_send_service, receipt_service
from app.services.leases.exceptions import (
    ReceiptGmailReauthError,
    ReceiptMissingApplicantEmailError,
    ReceiptMissingIntegrationError,
    ReceiptMissingLeaseError,
    ReceiptMissingSendScopeError,
    ReceiptTenantOfOtherMemberError,
    ReceiptTransactionNotAttributedError,
)
from tests.receipt_seed import CLIENT_TODAY, PERIOD_END, PERIOD_START, seed_receipt

pytestmark = pytest.mark.usefixtures("receipt_sessions")


async def _listing(org: Organization, user: User) -> PendingReceiptListResponse:
    return await receipt_service.get_pending_receipt_list(
        organization_id=org.id, user_id=user.id, limit=100, offset=0,
    )


async def _list(org: Organization, user: User) -> list[PendingReceiptResponse]:
    return (await _listing(org, user)).items


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


async def _delete_tenant(db: AsyncSession, txn_id: uuid.UUID) -> None:
    txn = await db.get(Transaction, txn_id)
    assert txn is not None
    await db.execute(
        update(Applicant)
        .where(Applicant.id == txn.applicant_id)
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    await db.commit()


async def _set_status(db: AsyncSession, txn_id: uuid.UUID, status: str) -> None:
    claim = (
        {"send_message_id": "<m@x>", "send_claimed_at": _dt.datetime.now(_dt.timezone.utc)}
        if status == "sending" else {}
    )
    await db.execute(
        update(PendingRentReceipt)
        .where(PendingRentReceipt.transaction_id == txn_id)
        .values(status=status, **claim)
    )
    await db.commit()


@pytest.mark.asyncio
async def test_ready_row_carries_payment_and_tenant(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    txn_id = await seed_receipt(
        db, org=test_org, user=test_user,
        payer_name="A LE", vendor="Chase", payment_method="bank_transfer",
    )

    [row] = await _list(test_org, test_user)

    assert row.transaction_id == txn_id
    assert row.tenant_name == "Andrew Le"
    assert row.amount == Decimal("1500.00")
    assert row.transaction_date == PERIOD_START
    assert row.payer_name == "A LE"
    assert row.vendor == "Chase"
    assert row.payment_method == "bank_transfer"
    assert row.period_start_date == PERIOD_START
    assert row.period_end_date == PERIOD_END
    assert row.send_blocker is None
    assert "tenant_email" not in PendingReceiptResponse.model_fields
    assert (await _listing(test_org, test_user)).gmail_state == "ready"


async def _no_email(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    return await seed_receipt(db, org=org, user=user, tenant_email=None)


async def _no_lease(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    return await seed_receipt(db, org=org, user=user, with_lease=False)


async def _unattributed(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    return await seed_receipt(db, org=org, user=user, attributed=False)


async def _tenant_deleted(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    txn_id = await seed_receipt(db, org=org, user=user)
    await _delete_tenant(db, txn_id)
    return txn_id


async def _lease_deleted(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    txn_id = await seed_receipt(db, org=org, user=user)
    await db.execute(update(SignedLease).values(deleted_at=_dt.datetime.now(_dt.timezone.utc)))
    await db.commit()
    return txn_id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("seed", "blocker", "send_error"),
    [
        (_no_email, "tenant_no_email", ReceiptMissingApplicantEmailError),
        (_no_lease, "no_lease", ReceiptMissingLeaseError),
        (_lease_deleted, "no_lease", ReceiptMissingLeaseError),
        (_unattributed, "not_attributed", ReceiptTransactionNotAttributedError),
        (_tenant_deleted, "not_attributed", ReceiptTransactionNotAttributedError),
    ],
)
async def test_blocker_matches_what_send_refuses(
    db: AsyncSession, test_org: Organization, test_user: User, receipt_gmail_send: AsyncMock,
    seed, blocker: str, send_error: type[Exception],
) -> None:
    txn_id = await seed(db, test_org, test_user)

    [row] = await _list(test_org, test_user)
    assert row.send_blocker == blocker

    with pytest.raises(send_error):
        await _send(test_org, test_user, txn_id)
    receipt_gmail_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_teammates_tenant_says_only_they_can_send(
    db: AsyncSession, test_org: Organization, test_user: User, receipt_gmail_send: AsyncMock,
) -> None:
    """Tenants are private to the member who added them; the list says so, by name only to them."""
    txn_id = await seed_receipt(db, org=test_org, user=test_user)
    other = User(
        id=uuid.uuid4(), email="other@example.com", hashed_password="x",
        is_active=True, is_superuser=False, is_verified=True,
    )
    db.add(other)
    await db.commit()

    [row] = await _list(test_org, other)
    assert row.tenant_name is None
    assert row.send_blocker == "tenant_of_other_member"
    with pytest.raises(ReceiptTenantOfOtherMemberError):
        await _send(test_org, other, txn_id)
    receipt_gmail_send.assert_not_awaited()

    with pytest.raises(ReceiptTenantOfOtherMemberError):
        await receipt_service.preview_receipt_pdf(
            transaction_id=txn_id, organization_id=test_org.id, user_id=other.id,
            period_start=PERIOD_START, period_end=PERIOD_END, payment_method=None,
            today=CLIENT_TODAY,
        )

    [own_row] = await _list(test_org, test_user)
    assert own_row.tenant_name == "Andrew Le"
    assert own_row.send_blocker is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("inquiry_email", "contact_email", "expected"),
    [
        (None, "andrew.le@work.example", "andrew.le@work.example"),
        ("andrew@example.com", "andrew.le@work.example", "andrew.le@work.example"),
        ("andrew@example.com", None, "andrew@example.com"),
    ],
)
@pytest.mark.usefixtures("receipt_storage")
async def test_tenant_email_prefers_their_contact_email(
    db: AsyncSession, test_org: Organization, test_user: User, receipt_gmail_send: AsyncMock,
    inquiry_email: str | None, contact_email: str | None, expected: str,
) -> None:
    txn_id = await seed_receipt(db, org=test_org, user=test_user, tenant_email=inquiry_email)
    txn = await db.get(Transaction, txn_id)
    assert txn is not None
    await db.execute(
        update(Applicant).where(Applicant.id == txn.applicant_id).values(contact_email=contact_email)
    )
    await db.commit()

    [row] = await _list(test_org, test_user)
    assert row.send_blocker is None

    await _send(test_org, test_user, txn_id)
    assert receipt_gmail_send.await_args.kwargs["to_address"] == expected


@pytest.mark.asyncio
async def test_lists_open_receipts_only_for_this_org(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    pending = await seed_receipt(db, org=test_org, user=test_user)
    sending = await seed_receipt(db, org=test_org, user=test_user, with_integration=False)
    sent = await seed_receipt(db, org=test_org, user=test_user, with_integration=False)
    dismissed = await seed_receipt(db, org=test_org, user=test_user, with_integration=False)
    await _set_status(db, sending, "sending")
    await _set_status(db, sent, "sent")
    await _set_status(db, dismissed, "dismissed")
    other_org = Organization(id=uuid.uuid4(), name="Other", created_by=test_user.id)
    db.add(other_org)
    await db.commit()
    await seed_receipt(db, org=other_org, user=test_user, with_integration=False)

    listing = await _listing(test_org, test_user)

    assert {r.transaction_id for r in listing.items} == {pending, sending}
    assert listing.total == listing.pending_count == 2


@pytest.mark.asyncio
async def test_total_counts_every_open_receipt_not_just_the_page(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    await seed_receipt(db, org=test_org, user=test_user)
    await seed_receipt(db, org=test_org, user=test_user, with_integration=False)

    listing = await receipt_service.get_pending_receipt_list(
        organization_id=test_org.id, user_id=test_user.id, limit=1, offset=0,
    )

    assert len(listing.items) == 1
    assert listing.total == 2
    assert listing.has_more is True


@pytest.mark.asyncio
async def test_pages_reach_every_open_receipt_and_the_last_says_no_more(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    seeded = {
        await seed_receipt(db, org=test_org, user=test_user, with_integration=index == 0)
        for index in range(5)
    }

    pages = [
        await receipt_service.get_pending_receipt_list(
            organization_id=test_org.id, user_id=test_user.id, limit=2, offset=offset,
        )
        for offset in (0, 2, 4)
    ]

    assert [page.has_more for page in pages] == [True, True, False]
    assert {row.transaction_id for page in pages for row in page.items} == seeded


@pytest.mark.asyncio
async def test_looks_up_one_open_receipt_past_the_first_page(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    oldest = await seed_receipt(db, org=test_org, user=test_user, payer_name="OLDEST")
    for _ in range(3):
        await seed_receipt(db, org=test_org, user=test_user, with_integration=False)
    # The list is newest first, so the oldest sits past a first page of two.
    await db.execute(
        update(PendingRentReceipt)
        .where(PendingRentReceipt.transaction_id == oldest)
        .values(created_at=_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=30))
    )
    await db.commit()
    first_page = await receipt_service.get_pending_receipt_list(
        organization_id=test_org.id, user_id=test_user.id, limit=2, offset=0,
    )
    assert oldest not in {row.transaction_id for row in first_page.items}

    lookup = await receipt_service.get_pending_receipt(
        transaction_id=oldest, organization_id=test_org.id, user_id=test_user.id,
    )

    assert lookup.item is not None
    assert lookup.item.transaction_id == oldest
    assert lookup.item.payer_name == "OLDEST"
    assert lookup.item.send_blocker is None
    assert lookup.gmail_state == "ready"


@pytest.mark.asyncio
async def test_lookup_says_none_for_a_finished_or_other_orgs_receipt(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    sent = await seed_receipt(db, org=test_org, user=test_user)
    sending = await seed_receipt(db, org=test_org, user=test_user, with_integration=False)
    await _set_status(db, sent, "sent")
    await _set_status(db, sending, "sending")
    other_org = Organization(id=uuid.uuid4(), name="Other", created_by=test_user.id)
    db.add(other_org)
    await db.commit()
    elsewhere = await seed_receipt(db, org=other_org, user=test_user, with_integration=False)

    async def lookup(txn_id: uuid.UUID):  # type: ignore[no-untyped-def]
        return await receipt_service.get_pending_receipt(
            transaction_id=txn_id, organization_id=test_org.id, user_id=test_user.id,
        )

    assert (await lookup(sent)).item is None
    assert (await lookup(elsewhere)).item is None
    still_sending = (await lookup(sending)).item
    assert still_sending is not None and still_sending.status == "sending"


async def _drop_gmail(db: AsyncSession) -> None:
    await db.execute(update(Integration).values(provider="other"))


async def _drop_send_scope(db: AsyncSession) -> None:
    await db.execute(update(Integration).values(metadata_={"scopes": []}))


async def _expire_gmail(db: AsyncSession) -> None:
    await db.execute(update(Integration).values(needs_reauth=True))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("break_gmail", "state", "send_error"),
    [
        (_drop_gmail, "not_connected", ReceiptMissingIntegrationError),
        (_drop_send_scope, "needs_send_permission", ReceiptMissingSendScopeError),
        (_expire_gmail, "needs_reconnect", ReceiptGmailReauthError),
    ],
)
async def test_gmail_state_matches_what_send_refuses(
    db: AsyncSession, test_org: Organization, test_user: User, receipt_gmail_send: AsyncMock,
    break_gmail, state: str, send_error: type[Exception],
) -> None:
    txn_id = await seed_receipt(db, org=test_org, user=test_user)
    await break_gmail(db)
    await db.commit()

    assert (await _listing(test_org, test_user)).gmail_state == state
    with pytest.raises(send_error):
        await _send(test_org, test_user, txn_id)
    receipt_gmail_send.assert_not_awaited()
