"""Record a reply Gmail sent, and read back the reply a claim recorded.

Shared by the send itself and by settling an earlier attempt that Gmail turns
out to have sent.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.repositories import (
    inquiry_event_repo,
    inquiry_message_repo,
    inquiry_repo,
    inquiry_reply_send_repo,
)
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse
from app.services.email.app_sent_email_service import record_app_sent_email
from app.services.email.constants import APP_SENT_INQUIRY_REPLY_FILTER_REASON
from app.services.inquiries.reply_exceptions import (
    InquiryReplyInProgressError,
    InquiryReplySentNotRecordedError,
)
from app.services.inquiries.reply_send_context import ReplySendContext

logger = logging.getLogger(__name__)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _next_stage_for_reply(current_stage: str) -> str | None:
    """Decide the post-reply stage. Returns None if no transition needed.

    Replies from 'new' or 'triaged' advance the inquiry to 'replied'.
    Later stages are preserved — host has already moved the inquiry forward.
    """
    if current_stage in ("new", "triaged"):
        return "replied"
    return None


async def recorded_message(
    db: AsyncSession, claim: InquiryReplySend, inquiry_id: uuid.UUID,
) -> InquiryMessageResponse:
    """The message a ``sent`` claim recorded."""
    message = (
        await inquiry_message_repo.get_for_inquiry(db, claim.inquiry_message_id, inquiry_id)
        if claim.inquiry_message_id is not None
        else None
    )
    if message is None:
        # The check constraint and the cascading FK rule this out.
        raise RuntimeError(f"Sent reply claim {claim.id} has no message")
    return InquiryMessageResponse.model_validate(message)


async def record_reply(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    ctx: ReplySendContext,
    from_address: str,
    subject: str,
    gmail_id: str,
    claim: tuple[uuid.UUID, str] | None,
) -> InquiryMessageResponse:
    """Record a reply Gmail sent: app-sent log, then message + claim + stage + event."""
    # Its own transaction, first, so the Gmail sync never re-ingests the host's
    # own reply even if the transaction below fails.
    await record_app_sent_email(
        organization_id=organization_id,
        user_id=user_id,
        message_id=gmail_id,
        from_address=from_address,
        subject=subject,
        reason=APP_SENT_INQUIRY_REPLY_FILTER_REASON,
    )
    now = _now()
    lost_claim_id: uuid.UUID | None = None
    try:
        async with unit_of_work() as db:
            message = await inquiry_message_repo.create(
                db,
                inquiry_id=inquiry_id,
                direction="outbound",
                channel="email",
                from_address=from_address,
                to_address=ctx.to_address,
                subject=subject,
                parsed_body=ctx.body,
                email_message_id=gmail_id,
                sent_at=now,
            )
            if claim is not None and not await inquiry_reply_send_repo.mark_sent(
                db,
                claim_id=claim[0],
                send_message_id=claim[1],
                inquiry_message_id=message.id,
            ):
                # Another attempt settled this claim first; keep its record, not ours.
                await db.rollback()
                lost_claim_id = claim[0]
            else:
                await _advance_inquiry(
                    db, organization_id=organization_id, inquiry_id=inquiry_id,
                    gmail_id=gmail_id, now=now,
                )
    except LookupError:
        raise
    except Exception as exc:
        logger.error(
            "Reply on inquiry %s was emailed (Gmail id %s) but couldn't be recorded",
            inquiry_id, gmail_id, exc_info=True,
        )
        raise InquiryReplySentNotRecordedError("The reply was emailed but not saved.") from exc

    if lost_claim_id is not None:
        return await claimed_reply(lost_claim_id, inquiry_id)
    return InquiryMessageResponse.model_validate(message)


async def _advance_inquiry(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    gmail_id: str,
    now: _dt.datetime,
) -> None:
    """Move the stage on and log the reply, reading the inquiry inside the transaction."""
    inquiry_in_tx = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
    if inquiry_in_tx is None:
        # Deleted after the send. The email is in the recipient's inbox;
        # the claim went with the inquiry.
        logger.error(
            "Inquiry %s vanished between Gmail send and message persist "
            "(gmail_message_id=%s)", inquiry_id, gmail_id,
        )
        raise LookupError(f"Inquiry {inquiry_id} not found")

    next_stage = _next_stage_for_reply(inquiry_in_tx.stage)
    if next_stage is not None and next_stage != inquiry_in_tx.stage:
        await inquiry_repo.update_inquiry(
            db, inquiry_id, organization_id, {"stage": next_stage},
        )

    await inquiry_event_repo.create(
        db,
        inquiry_id=inquiry_id,
        event_type="replied",
        actor="host",
        occurred_at=now,
    )


async def claimed_reply(claim_id: uuid.UUID, inquiry_id: uuid.UUID) -> InquiryMessageResponse:
    """What became of a claim another attempt settled: its reply, or still in flight."""
    async with AsyncSessionLocal() as db:
        current = await inquiry_reply_send_repo.get_by_id(db, claim_id)
        if current is not None and current.status == "sent":
            return await recorded_message(db, current, inquiry_id)
    raise InquiryReplyInProgressError("This reply is being sent right now.")
