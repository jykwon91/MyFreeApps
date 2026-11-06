"""A receipt left mid-send is only settled by the Gmail account it went through.

Settling searches the connected mailbox for the earlier attempt. After a
reconnect to another account that search can't see the attempt, so the receipt
is kept and the account is named instead of the tenant getting it twice.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.integration import Integration
from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.services.email import gmail_attachment_send_service, gmail_mailbox
from app.services.email.constants import GMAIL_SEND_CLAIM_STALE_AFTER
from app.services.email.exceptions import GmailReauthRequiredError, GmailSendOutcomeUnknownError
from app.services.leases import receipt_send_service, receipt_service
from app.services.leases.exceptions import (
    ReceiptGmailReauthError,
    ReceiptGmailSendError,
    ReceiptSendInProgressError,
    ReceiptSendUnconfirmedError,
    ReceiptSentFromOtherGmailError,
)
from tests.receipt_seed import PERIOD_END, PERIOD_START
from tests.receipt_seed import seed_receipt as _seed

pytestmark = pytest.mark.usefixtures("receipt_sessions", "receipt_storage")


@pytest.fixture
def gmail_find(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value=None)
    monkeypatch.setattr(gmail_attachment_send_service, "find_sent_message_id", mock)
    return mock


@pytest.fixture
def profile(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value={"emailAddress": "host@gmail.com"})
    monkeypatch.setattr(gmail_mailbox, "execute_gmail_read", mock)
    return mock


async def _send(org: Organization, user: User, txn_id: uuid.UUID):  # type: ignore[no-untyped-def]
    return await receipt_send_service.send_receipt(
        transaction_id=txn_id,
        organization_id=org.id,
        user_id=user.id,
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        payment_method="zelle",
    )


async def _dismiss(org: Organization, txn_id: uuid.UUID) -> None:
    await receipt_service.dismiss_pending_receipt(transaction_id=txn_id, organization_id=org.id)


async def _row(db: AsyncSession, txn_id: uuid.UUID) -> PendingRentReceipt:
    return (await db.execute(
        select(PendingRentReceipt)
        .where(PendingRentReceipt.transaction_id == txn_id)
        .execution_options(populate_existing=True)
    )).scalar_one()


async def _integration(db: AsyncSession) -> Integration:
    return (await db.execute(
        select(Integration).execution_options(populate_existing=True),
    )).scalar_one()


async def _connect_as(db: AsyncSession, address: str | None) -> None:
    await db.execute(update(Integration).values(gmail_address=address))
    await db.commit()


async def _set_receipt(db: AsyncSession, txn_id: uuid.UUID, **values: object) -> None:
    await db.execute(
        update(PendingRentReceipt).where(PendingRentReceipt.transaction_id == txn_id).values(**values)
    )
    await db.commit()


async def _stuck_send(
    db: AsyncSession, org: Organization, user: User, gmail_send: AsyncMock, *, stale: bool = True,
) -> uuid.UUID:
    """A receipt whose send Gmail never confirmed, claimed through host@gmail.com."""
    txn_id = await _seed(db, org=org, user=user)
    gmail_send.side_effect = GmailSendOutcomeUnknownError("reset")
    with pytest.raises(ReceiptSendUnconfirmedError):
        await _send(org, user, txn_id)
    gmail_send.side_effect = None
    if stale:
        old = _dt.datetime.now(_dt.timezone.utc) - GMAIL_SEND_CLAIM_STALE_AFTER - _dt.timedelta(minutes=1)
        await _set_receipt(db, txn_id, send_claimed_at=old)
    return txn_id


@pytest.mark.asyncio
async def test_claim_records_the_account_it_sends_through(
    db: AsyncSession, test_org, test_user, receipt_gmail_send,
) -> None:
    txn_id = await _stuck_send(db, test_org, test_user, receipt_gmail_send, stale=False)
    assert (await _row(db, txn_id)).sender_gmail_address == "host@gmail.com"


@pytest.mark.asyncio
async def test_stuck_send_from_another_account_is_kept_and_not_resent(
    db: AsyncSession, test_org, test_user, receipt_gmail_send, gmail_find,
) -> None:
    txn_id = await _stuck_send(db, test_org, test_user, receipt_gmail_send)
    before = await _row(db, txn_id)
    await _connect_as(db, "other@gmail.com")

    with pytest.raises(ReceiptSentFromOtherGmailError) as raised:
        await _send(test_org, test_user, txn_id)

    assert raised.value.sender_gmail_address == "host@gmail.com"
    gmail_find.assert_not_awaited()
    assert receipt_gmail_send.await_count == 1
    after = await _row(db, txn_id)
    assert after.status == "sending"
    assert after.send_message_id == before.send_message_id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("claim_address", "connected_address"),
    [("host@gmail.com", " HOST@Gmail.com "), (None, "other@gmail.com")],
    ids=["same-account-other-case", "legacy-claim-without-address"],
)
async def test_stuck_send_settles_against_the_connected_account(
    db: AsyncSession, test_org, test_user, receipt_gmail_send, gmail_find,
    claim_address, connected_address,
) -> None:
    txn_id = await _stuck_send(db, test_org, test_user, receipt_gmail_send)
    await _set_receipt(db, txn_id, sender_gmail_address=claim_address)
    await _connect_as(db, connected_address)

    await _send(test_org, test_user, txn_id)

    assert gmail_find.await_count == 1
    assert receipt_gmail_send.await_count == 2
    assert (await _row(db, txn_id)).status == "sent"


@pytest.mark.asyncio
async def test_connection_without_an_address_asks_gmail_once_and_keeps_it(
    db: AsyncSession, test_org, test_user, receipt_gmail_send, profile,
) -> None:
    txn_id = await _seed(db, org=test_org, user=test_user)
    await _connect_as(db, None)

    await _send(test_org, test_user, txn_id)

    profile.assert_awaited_once()
    assert (await _integration(db)).gmail_address == "host@gmail.com"
    assert (await _row(db, txn_id)).sender_gmail_address == "host@gmail.com"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "raised"),
    [
        (GmailReauthRequiredError("expired"), ReceiptGmailReauthError),
        (ConnectionError("gmail unreachable"), ReceiptGmailSendError),
        ({"emailAddress": ""}, ReceiptGmailSendError),
    ],
    ids=["reauth", "unreachable", "no-address"],
)
async def test_unknown_account_refuses_before_anything_is_claimed(
    db: AsyncSession, test_org, test_user, receipt_gmail_send, profile, failure, raised,
) -> None:
    txn_id = await _seed(db, org=test_org, user=test_user)
    await _connect_as(db, None)
    if isinstance(failure, Exception):
        profile.side_effect = failure
    else:
        profile.return_value = failure

    with pytest.raises(raised):
        await _send(test_org, test_user, txn_id)

    receipt_gmail_send.assert_not_awaited()
    row = await _row(db, txn_id)
    assert row.status == "pending"
    assert row.send_message_id is None
    assert (await _integration(db)).gmail_address is None


@pytest.mark.asyncio
async def test_address_found_after_a_reconnect_is_used_but_not_saved(
    db: AsyncSession, test_org, test_user, receipt_gmail_send, profile,
) -> None:
    txn_id = await _seed(db, org=test_org, user=test_user)
    await _connect_as(db, None)

    async def _reconnect_meanwhile(*_args: object, **_kwargs: object) -> dict[str, str]:
        integration = await _integration(db)
        integration.refresh_token = "new-rt"
        await db.commit()
        return {"emailAddress": "host@gmail.com"}

    profile.side_effect = _reconnect_meanwhile

    await _send(test_org, test_user, txn_id)

    assert (await _integration(db)).gmail_address is None
    assert (await _row(db, txn_id)).sender_gmail_address == "host@gmail.com"


@pytest.mark.asyncio
@pytest.mark.parametrize("connected", ["other@gmail.com", "disconnected"])
async def test_stuck_send_on_an_account_no_longer_connected_can_be_dismissed(
    db: AsyncSession, test_org, test_user, receipt_gmail_send, connected,
) -> None:
    txn_id = await _stuck_send(db, test_org, test_user, receipt_gmail_send)
    if connected == "disconnected":
        await db.delete(await _integration(db))
        await db.commit()
    else:
        await _connect_as(db, connected)

    await _dismiss(test_org, txn_id)

    assert (await _row(db, txn_id)).status == "dismissed"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("connected", "stale", "claim_address"),
    [
        ("HOST@gmail.com", True, "host@gmail.com"),
        ("other@gmail.com", False, "host@gmail.com"),
        (None, True, "host@gmail.com"),
        ("other@gmail.com", True, None),
    ],
    ids=["same-account", "still-running", "connection-address-unknown", "legacy-claim"],
)
async def test_stuck_send_that_sending_can_settle_is_not_dismissed(
    db: AsyncSession, test_org, test_user, receipt_gmail_send, connected, stale, claim_address,
) -> None:
    txn_id = await _stuck_send(db, test_org, test_user, receipt_gmail_send, stale=stale)
    await _set_receipt(db, txn_id, sender_gmail_address=claim_address)
    await _connect_as(db, connected)

    with pytest.raises(ReceiptSendInProgressError):
        await _dismiss(test_org, txn_id)

    assert (await _row(db, txn_id)).status == "sending"
