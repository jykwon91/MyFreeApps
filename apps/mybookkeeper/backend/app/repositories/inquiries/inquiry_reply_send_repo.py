"""Repository for ``inquiry_reply_sends`` — claimed reply sends.

Every write that changes a claim is conditional on the claim still being the
one the caller took (``sending`` with this ``send_message_id``), so two attempts
that both read the same row can never both act on it.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.repositories.inquiries.reply_already_claimed_error import ReplyAlreadyClaimedError


async def get_by_id(db: AsyncSession, claim_id: uuid.UUID) -> InquiryReplySend | None:
    result = await db.execute(
        select(InquiryReplySend)
        .where(InquiryReplySend.id == claim_id)
        .execution_options(populate_existing=True),
    )
    return result.scalar_one_or_none()


async def get_by_key(
    db: AsyncSession, *, inquiry_id: uuid.UUID, client_request_id: uuid.UUID,
) -> InquiryReplySend | None:
    result = await db.execute(
        select(InquiryReplySend).where(
            InquiryReplySend.inquiry_id == inquiry_id,
            InquiryReplySend.client_request_id == client_request_id,
        ),
    )
    return result.scalar_one_or_none()


async def claim(
    db: AsyncSession,
    *,
    inquiry_id: uuid.UUID,
    client_request_id: uuid.UUID,
    request_hash: str,
    send_message_id: str,
    claimed_at: _dt.datetime,
) -> InquiryReplySend:
    """Insert a ``sending`` claim, or raise ``ReplyAlreadyClaimedError``.

    The unique constraint catches two attempts that both found no claim. The
    caller runs this in its own transaction, so a violation only rolls back
    the claim itself.
    """
    row = InquiryReplySend(
        inquiry_id=inquiry_id,
        client_request_id=client_request_id,
        request_hash=request_hash,
        status="sending",
        send_message_id=send_message_id,
        claimed_at=claimed_at,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ReplyAlreadyClaimedError(f"{inquiry_id}/{client_request_id}") from exc
    return row


async def release(db: AsyncSession, *, claim_id: uuid.UUID, send_message_id: str) -> bool:
    """Delete a claim whose reply definitely did not go out. False if it was no longer held."""
    result = await db.execute(
        delete(InquiryReplySend)
        .where(
            InquiryReplySend.id == claim_id,
            InquiryReplySend.status == "sending",
            InquiryReplySend.send_message_id == send_message_id,
        )
        .execution_options(synchronize_session=False),
    )
    return result.rowcount == 1


async def mark_sent(
    db: AsyncSession,
    *,
    claim_id: uuid.UUID,
    send_message_id: str,
    inquiry_message_id: uuid.UUID,
) -> bool:
    """Point the claim at the message it recorded. False if it was no longer held."""
    result = await db.execute(
        update(InquiryReplySend)
        .where(
            InquiryReplySend.id == claim_id,
            InquiryReplySend.status == "sending",
            InquiryReplySend.send_message_id == send_message_id,
        )
        .values(
            status="sent",
            inquiry_message_id=inquiry_message_id,
            updated_at=_dt.datetime.now(_dt.timezone.utc),
        )
        .execution_options(synchronize_session=False),
    )
    return result.rowcount == 1
