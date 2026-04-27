"""Repository for ``inquiry_messages`` — append-only.

No ``update`` method exists by design — InquiryMessage rows are immutable
(per RENTALS_PLAN.md §5.2). Re-parsing a raw email body produces a NEW
parsed_body field on the SAME row only via a future re-parse worker, which
will go through this repo via a dedicated ``set_parsed_body`` helper if
needed. For PR 2.1a, no such helper is exposed.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry_message import InquiryMessage


async def create(
    db: AsyncSession,
    *,
    inquiry_id: uuid.UUID,
    direction: str,
    channel: str,
    from_address: str | None = None,
    to_address: str | None = None,
    subject: str | None = None,
    raw_email_body: str | None = None,
    parsed_body: str | None = None,
    email_message_id: str | None = None,
    sent_at: _dt.datetime | None = None,
) -> InquiryMessage:
    msg = InquiryMessage(
        inquiry_id=inquiry_id,
        direction=direction,
        channel=channel,
        from_address=from_address,
        to_address=to_address,
        subject=subject,
        raw_email_body=raw_email_body,
        parsed_body=parsed_body,
        email_message_id=email_message_id,
        sent_at=sent_at,
    )
    db.add(msg)
    await db.flush()
    return msg


async def list_by_inquiry(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[InquiryMessage]:
    """Return messages for an inquiry in chronological (created_at asc) order."""
    result = await db.execute(
        select(InquiryMessage)
        .where(InquiryMessage.inquiry_id == inquiry_id)
        .order_by(asc(InquiryMessage.created_at))
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def find_by_email_message_id(
    db: AsyncSession,
    email_message_id: str,
) -> InquiryMessage | None:
    """Dedup helper for the PR 2.2 reconciler.

    Scoping: ``email_message_id`` is a global unique identifier issued by the
    sending mail server (RFC 5322 ``Message-ID``); two distinct human inquiries
    cannot legitimately share one. No tenant filter is needed — but at the
    parent ``Inquiry`` level we DO scope by ``user_id`` (see
    ``inquiry_repo.find_by_email_message_id``) so two users in different orgs
    forwarding the same chain are still treated as separate inquiries.
    """
    result = await db.execute(
        select(InquiryMessage).where(
            InquiryMessage.email_message_id == email_message_id,
        )
    )
    return result.scalar_one_or_none()
