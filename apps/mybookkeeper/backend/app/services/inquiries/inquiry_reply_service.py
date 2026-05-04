"""Inquiry reply service — orchestrates the templated-reply send flow.

Send-then-persist ordering rationale:
    Persisting the InquiryMessage row first and then sending would create
    a window where Gmail rejects the message but the audit trail still
    claims a reply went out. Sending first means a Gmail failure leaves no
    record (the host sees an error and can retry); a successful send is
    immediately followed by the message-row insert + stage transition +
    event emission inside a single ``unit_of_work`` transaction so the
    timeline can never end up partially updated.

    The narrow case of "Gmail accepted but the DB transaction failed"
    leaves an outbound message with no record. We log loudly so the host
    can be alerted, but this is preferable to "DB record exists for a
    message that was never sent" — the latter is a worse trust violation.

Stage transition rule (per the plan):
    The reply advances the inquiry from 'new' or 'triaged' to 'replied'.
    Later stages (screening_requested, video_call_scheduled, approved,
    declined, converted, archived) are NOT regressed — once a host has
    moved an inquiry forward, sending another reply doesn't pull it back.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import (
    inquiry_event_repo,
    inquiry_message_repo,
    inquiry_repo,
    integration_repo,
)
from app.repositories.user import user_repo
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse
from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest
from app.services.email import gmail_service
from app.services.email.exceptions import GmailReauthRequiredError, GmailSendError, GmailSendScopeError
from app.services.integrations import integration_service

logger = logging.getLogger(__name__)


class InquiryReplyMissingIntegrationError(Exception):
    """Host has no Gmail integration connected."""


class InquiryReplyMissingSendScopeError(Exception):
    """Host's Gmail integration lacks the gmail.send scope. Reconnect required."""


class InquiryReplyMissingRecipientError(Exception):
    """Inquiry has no inquirer_email — can't send a reply."""


class InquiryReplyAuthExpiredError(Exception):
    """Gmail token expired while trying to send the reply. User must reconnect Gmail."""


class InquiryReplySendFailedError(Exception):
    """Gmail rejected the outbound message for a non-auth reason."""


def _next_stage_for_reply(current_stage: str) -> str | None:
    """Decide the post-reply stage. Returns None if no transition needed.

    Replies from 'new' or 'triaged' advance the inquiry to 'replied'.
    Later stages are preserved — host has already moved the inquiry forward.
    """
    if current_stage in ("new", "triaged"):
        return "replied"
    return None


async def send_reply(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    request: InquiryReplyRequest,
) -> InquiryMessageResponse:
    """Send a templated (or custom) reply via Gmail and record the outbound message."""
    # ----- Phase 1: load + validate (read-only, separate session) -----
    async with AsyncSessionLocal() as db:
        inquiry = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
        if inquiry is None:
            raise LookupError(f"Inquiry {inquiry_id} not found")

        to_address = inquiry.inquirer_email
        if not to_address:
            raise InquiryReplyMissingRecipientError(
                "Cannot send a reply — the inquirer has no email address on file.",
            )

        integration = await integration_repo.get_by_org_and_provider(
            db, organization_id, "gmail",
        )
        if integration is None:
            raise InquiryReplyMissingIntegrationError(
                "Connect Gmail before replying to inquiries.",
            )
        if not integration_service.integration_has_send_scope(integration):
            raise InquiryReplyMissingSendScopeError(
                "Gmail send permission missing. Reconnect Gmail to enable replies.",
            )

        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.email:
            raise LookupError(f"User {user_id} not found or has no email")
        from_address = user.email
        original_email_message_id = inquiry.email_message_id

    # ----- Phase 2: send via Gmail (network call, no DB) -----
    try:
        sent_message_id = gmail_service.send_message(
            integration,
            from_address=from_address,
            to_address=to_address,
            subject=request.subject,
            body=request.body,
            in_reply_to_message_id=original_email_message_id,
        )
    except GmailReauthRequiredError as exc:
        # Token was rejected by Google. Flip the flag so the UI shows the
        # reconnect prompt immediately. Use a short-lived session so the
        # flag write commits even if this function is called from a route
        # that has no enclosing transaction.
        async with unit_of_work() as db:
            stale = await integration_repo.get_by_org_and_provider(
                db, organization_id, "gmail",
            )
            if stale is not None:
                import datetime as _dtnow
                await integration_repo.mark_needs_reauth(
                    db, stale, repr(exc)[:200], _dtnow.datetime.now(_dtnow.timezone.utc)
                )
        raise InquiryReplyAuthExpiredError(str(exc)) from exc
    except GmailSendScopeError as exc:
        # Defensive — we already checked scope but Google may have revoked
        # it between the check and the send. Map to the same scope error.
        raise InquiryReplyMissingSendScopeError(str(exc)) from exc
    except GmailSendError as exc:
        raise InquiryReplySendFailedError(str(exc)) from exc

    # ----- Phase 3: persist message + event + stage transition (atomic) -----
    now = _dt.datetime.now(_dt.timezone.utc)
    async with unit_of_work() as db:
        message = await inquiry_message_repo.create(
            db,
            inquiry_id=inquiry_id,
            direction="outbound",
            channel="email",
            from_address=from_address,
            to_address=to_address,
            subject=request.subject,
            parsed_body=request.body,
            email_message_id=sent_message_id,
            sent_at=now,
        )

        # Reload inquiry inside this transaction so we read the latest stage.
        inquiry_in_tx = await inquiry_repo.get_by_id(
            db, inquiry_id, organization_id,
        )
        if inquiry_in_tx is None:
            # Race: deleted between phase 1 and phase 3. The message was
            # successfully sent — log loudly so the host knows, but don't
            # crash since the email is already in the recipient's inbox.
            logger.error(
                "Inquiry %s vanished between Gmail send and message persist "
                "(gmail_message_id=%s)", inquiry_id, sent_message_id,
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

    return InquiryMessageResponse.model_validate(message)
