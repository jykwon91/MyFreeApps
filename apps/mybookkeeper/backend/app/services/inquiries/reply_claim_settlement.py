"""Settle a reply claim an earlier attempt left ``sending``, or release one.

Settling searches the connected mailbox for the claim's Message-ID. That only
answers "was it sent?" when the claim went through the connected account: after
a reconnect to another account the search finds nothing and the reply would go
out a second time. So the claim's address is compared first, and a claim from
another account is kept and reported instead.
"""
from __future__ import annotations

import logging
import uuid

from app.db.session import unit_of_work
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.repositories import inquiry_reply_send_repo
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse
from app.services.email import gmail_sent_lookup
from app.services.email.constants import GMAIL_PURPOSE_SEND_REPLIES
from app.services.email.exceptions import GmailReauthRequiredError
from app.services.email.gmail_address_match import same_gmail_address
from app.services.inquiries.reply_exceptions import (
    InquiryReplyAuthExpiredError,
    InquiryReplyInProgressError,
    InquiryReplySentFromOtherGmailError,
    InquiryReplyUnconfirmedError,
)
from app.services.inquiries.reply_recording import record_reply
from app.services.inquiries.reply_send_context import ReplySendContext

logger = logging.getLogger(__name__)


async def release(claim_id: uuid.UUID, send_message_id: str) -> bool:
    """Delete a claim whose reply definitely did not go out. False if it was no longer held."""
    async with unit_of_work() as db:
        return await inquiry_reply_send_repo.release(
            db, claim_id=claim_id, send_message_id=send_message_id,
        )


async def settle_stale_claim(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    ctx: ReplySendContext,
    subject: str,
    claim: InquiryReplySend,
    connected_address: str,
) -> InquiryMessageResponse | None:
    """Finish an earlier attempt Gmail did send, or release its claim. None once released.

    Raises ``InquiryReplySentFromOtherGmailError``, keeping the claim, when it
    went through an account other than ``connected_address``.
    """
    sender = claim.sender_gmail_address
    if sender is None:
        logger.info("Reply claim %s has no recorded account; checking the connected one", claim.id)
    elif not same_gmail_address(sender, connected_address):
        logger.warning(
            "Reply claim %s went through a Gmail account that's no longer connected; keeping it",
            claim.id,
        )
        raise InquiryReplySentFromOtherGmailError(sender)

    try:
        gmail_id = await gmail_sent_lookup.find_by_message_id_header(
            ctx.integration, claim.send_message_id, purpose=GMAIL_PURPOSE_SEND_REPLIES,
        )
    except GmailReauthRequiredError as exc:
        raise InquiryReplyAuthExpiredError(str(exc)) from exc
    except Exception as exc:
        logger.error(
            "Could not check Gmail for reply claim %s (Message-ID %s)",
            claim.id, claim.send_message_id, exc_info=True,
        )
        raise InquiryReplyUnconfirmedError("Couldn't check Gmail for this reply.") from exc

    if gmail_id is not None:
        logger.info("Reply claim %s was already in Gmail's Sent; recording it", claim.id)
        return await record_reply(
            organization_id=organization_id,
            user_id=user_id,
            inquiry_id=inquiry_id,
            ctx=ctx,
            from_address=connected_address,
            subject=subject,
            gmail_id=gmail_id,
            claim=(claim.id, claim.send_message_id),
        )

    logger.warning("Reply claim %s is stale and Gmail has no such message; releasing it", claim.id)
    if not await release(claim.id, claim.send_message_id):
        raise InquiryReplyInProgressError("This reply is being sent right now.")
    return None
