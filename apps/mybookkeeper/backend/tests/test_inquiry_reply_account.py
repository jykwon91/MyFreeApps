"""A reply left mid-send is only settled by the Gmail account it went through.

Settling searches the connected mailbox for the claim's Message-ID. After a
reconnect to another account that search can't see the claim, so it is kept
and the account is named instead of the inquirer getting the reply twice.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.services.email import gmail_mailbox
from app.services.email.exceptions import GmailReauthRequiredError, GmailSendOutcomeUnknownError
from app.services.inquiries.reply_exceptions import (
    InquiryReplyAuthExpiredError,
    InquiryReplySendFailedError,
    InquiryReplySentFromOtherGmailError,
    InquiryReplyUnconfirmedError,
)
from tests.reply_seed import age_reply_claims, reply_claims, reply_request, seed_inquiry, send_reply

pytestmark = pytest.mark.usefixtures("reply_sessions")


@pytest.fixture
def profile(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value={"emailAddress": "host@gmail.com"})
    monkeypatch.setattr(gmail_mailbox, "execute_gmail_read", mock)
    return mock


async def _integration(db: AsyncSession) -> Integration:
    return (await db.execute(
        select(Integration).execution_options(populate_existing=True),
    )).scalar_one()


async def _connect_as(db: AsyncSession, address: str | None) -> None:
    await db.execute(update(Integration).values(gmail_address=address))
    await db.commit()


async def _stuck_reply(
    db: AsyncSession, org: Organization, user: User, gmail_send: AsyncMock,
) -> tuple[Inquiry, uuid.UUID]:
    """A stale reply claim, sent through host@gmail.com, that Gmail never confirmed."""
    inquiry = await seed_inquiry(db, org, user)
    key = uuid.uuid4()
    gmail_send.side_effect = GmailSendOutcomeUnknownError("reset")
    with pytest.raises(InquiryReplyUnconfirmedError):
        await send_reply(org, user, inquiry, reply_request(key))
    gmail_send.side_effect = None
    await age_reply_claims(db)
    return inquiry, key


@pytest.mark.asyncio
async def test_stuck_reply_from_another_account_is_kept_and_not_resent(
    db: AsyncSession, test_org, test_user, reply_gmail_send, reply_gmail_find,
) -> None:
    inquiry, key = await _stuck_reply(db, test_org, test_user, reply_gmail_send)
    [before] = await reply_claims(db)
    assert before.sender_gmail_address == "host@gmail.com"
    await _connect_as(db, "other@gmail.com")

    with pytest.raises(InquiryReplySentFromOtherGmailError) as raised:
        await send_reply(test_org, test_user, inquiry, reply_request(key))

    assert raised.value.sender_gmail_address == "host@gmail.com"
    reply_gmail_find.assert_not_awaited()
    assert reply_gmail_send.await_count == 1
    [after] = await reply_claims(db)
    assert after.status == "sending"
    assert after.send_message_id == before.send_message_id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("claim_address", "connected_address"),
    [("host@gmail.com", "Host@GMAIL.com"), (None, "other@gmail.com")],
    ids=["same-account-other-case", "legacy-claim-without-address"],
)
async def test_stuck_reply_settles_against_the_connected_account(
    db: AsyncSession, test_org, test_user, reply_gmail_send, reply_gmail_find,
    claim_address, connected_address,
) -> None:
    inquiry, key = await _stuck_reply(db, test_org, test_user, reply_gmail_send)
    await db.execute(update(InquiryReplySend).values(sender_gmail_address=claim_address))
    await db.commit()
    await _connect_as(db, connected_address)

    await send_reply(test_org, test_user, inquiry, reply_request(key))

    assert reply_gmail_find.await_count == 1
    assert reply_gmail_send.await_count == 2
    [claim] = await reply_claims(db)
    assert claim.status == "sent"


@pytest.mark.asyncio
async def test_connection_without_an_address_asks_gmail_once_and_keeps_it(
    db: AsyncSession, test_org, test_user, reply_gmail_send, profile,
) -> None:
    inquiry = await seed_inquiry(db, test_org, test_user)
    await _connect_as(db, None)

    await send_reply(test_org, test_user, inquiry, reply_request(uuid.uuid4()))

    profile.assert_awaited_once()
    assert (await _integration(db)).gmail_address == "host@gmail.com"
    [claim] = await reply_claims(db)
    assert claim.sender_gmail_address == "host@gmail.com"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "raised"),
    [
        (GmailReauthRequiredError("expired"), InquiryReplyAuthExpiredError),
        (ConnectionError("gmail unreachable"), InquiryReplySendFailedError),
    ],
    ids=["reauth", "unreachable"],
)
async def test_unknown_account_refuses_before_anything_is_claimed(
    db: AsyncSession, test_org, test_user, reply_gmail_send, profile, failure, raised,
) -> None:
    inquiry = await seed_inquiry(db, test_org, test_user)
    await _connect_as(db, None)
    profile.side_effect = failure

    with pytest.raises(raised):
        await send_reply(test_org, test_user, inquiry, reply_request(uuid.uuid4()))

    reply_gmail_send.assert_not_awaited()
    assert await reply_claims(db) == []


@pytest.mark.asyncio
async def test_reply_without_a_key_does_not_ask_for_the_account(
    db: AsyncSession, test_org, test_user, reply_gmail_send, profile,
) -> None:
    inquiry = await seed_inquiry(db, test_org, test_user)
    await _connect_as(db, None)

    await send_reply(test_org, test_user, inquiry, reply_request(None))

    profile.assert_not_awaited()
    assert reply_gmail_send.await_count == 1
