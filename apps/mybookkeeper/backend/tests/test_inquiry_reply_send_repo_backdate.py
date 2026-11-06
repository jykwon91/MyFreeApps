"""``backdate_open_claims`` moves only one inquiry's unconfirmed claims, for the E2E helpers."""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.inquiries import inquiry_reply_send_repo
from tests.reply_seed import reply_claims, reply_request, seed_inquiry, send_reply

pytestmark = pytest.mark.usefixtures("reply_sessions")


async def _claim(db: AsyncSession, inquiry_id: uuid.UUID, now: _dt.datetime) -> InquiryReplySend:
    return await inquiry_reply_send_repo.claim(
        db,
        inquiry_id=inquiry_id,
        client_request_id=uuid.uuid4(),
        request_hash="h",
        send_message_id=f"<{uuid.uuid4()}@test>",
        sender_gmail_address="host@gmail.com",
        claimed_at=now,
    )


@pytest.mark.asyncio
async def test_backdates_only_that_inquirys_sending_claims(
    db: AsyncSession, test_org: Organization, test_user: User, reply_gmail_send,
) -> None:
    now = _dt.datetime.now(_dt.timezone.utc)
    old = now - _dt.timedelta(hours=1)
    inquiry = await seed_inquiry(db, test_org, test_user)
    other = await seed_inquiry(db, test_org, test_user, with_gmail=False)
    await send_reply(test_org, test_user, inquiry, reply_request(uuid.uuid4()))
    [sent] = await reply_claims(db)
    sent_at = sent.claimed_at
    sending = await _claim(db, inquiry.id, now)
    elsewhere = await _claim(db, other.id, now)
    await db.commit()

    await inquiry_reply_send_repo.backdate_open_claims(db, inquiry_id=inquiry.id, claimed_at=old)
    await db.commit()

    # SQLite hands timestamps back without their zone.
    claimed_at = {claim.id: claim.claimed_at.replace(tzinfo=None) for claim in await reply_claims(db)}
    assert claimed_at[sending.id] == old.replace(tzinfo=None)
    assert claimed_at[sent.id] == sent_at.replace(tzinfo=None)
    assert claimed_at[elsewhere.id] == now.replace(tzinfo=None)
