"""Inquiry reply service — orchestrates the templated-reply send flow.

Send-then-persist ordering rationale:
    Persisting the InquiryMessage row first and then sending would create
    a window where Gmail rejects the message but the audit trail still
    claims a reply went out. Sending first means a Gmail failure leaves no
    record (the host sees an error and can retry); a successful send is
    immediately followed by the message-row insert + stage transition +
    event emission inside a single ``unit_of_work`` transaction so the
    timeline can never end up partially updated.

Never emailing twice (``client_request_id``):
    The website and phone send one ``client_request_id`` per reply as written,
    with every attempt. Before calling Gmail the send is claimed in
    ``inquiry_reply_sends`` with the RFC 822 Message-ID it goes out with, and
    the claim is committed. A repeat of the same id then:

    - gets the recorded message back once the reply is sent;
    - is refused (``InquiryReplyInProgressError``) while the claim is younger
      than ``GMAIL_SEND_CLAIM_STALE_AFTER``, since that attempt may still be
      running;
    - after that, settles the claim by looking the Message-ID up in Gmail:
      found → the reply is recorded and returned; not found → the claim is
      released and this attempt sends.

    A send Gmail definitely refused releases its claim. One whose outcome is
    unknown (timeout, 5xx), or that was sent but couldn't be recorded, keeps
    it, and the next attempt settles it as above. A request without an id
    (phone builds from before it existed) sends unclaimed, as it always has.

Disclosure rule (RENTALS_PLAN.md §9.3):
    The inquirer must hear about pets on the premises before anything else,
    whether the host used a template, wrote their own reply or edited the
    disclosure out. It's added here, at the last step every reply passes
    through, unless this reply or an earlier one already says it. New wording
    on the listing counts as something new to tell them.

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
from email.utils import make_msgid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.repositories import (
    inquiry_event_repo,
    inquiry_message_repo,
    inquiry_repo,
    inquiry_reply_send_repo,
    integration_repo,
)
from app.repositories.inquiries.reply_already_claimed_error import ReplyAlreadyClaimedError
from app.repositories.listings import listing_repo
from app.repositories.user import user_repo
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse
from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest
from app.services.email import gmail_sent_lookup, gmail_service
from app.services.email.app_sent_email_service import record_app_sent_email
from app.services.email.constants import APP_SENT_INQUIRY_REPLY_FILTER_REASON, GMAIL_MESSAGE_ID_DOMAIN
from app.services.email.exceptions import (
    GmailReauthRequiredError,
    GmailSendError,
    GmailSendOutcomeUnknownError,
    GmailSendScopeError,
)
from app.services.email.send_claim_staleness import is_send_claim_stale
from app.services.inquiries import reply_template_renderer
from app.services.inquiries.reply_exceptions import (
    InquiryReplyAuthExpiredError,
    InquiryReplyInProgressError,
    InquiryReplyMissingIntegrationError,
    InquiryReplyMissingRecipientError,
    InquiryReplyMissingSendScopeError,
    InquiryReplyRequestIdReusedError,
    InquiryReplySendFailedError,
    InquiryReplySentNotRecordedError,
    InquiryReplyUnconfirmedError,
)
from app.services.inquiries.reply_request_hash import reply_request_hash
from app.services.inquiries.reply_send_context import ReplySendContext
from app.services.integrations import integration_service

logger = logging.getLogger(__name__)

_PURPOSE = "send replies"


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


async def _recorded_message(
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


async def _load(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    request: InquiryReplyRequest,
    request_hash: str,
) -> ReplySendContext | InquiryMessageResponse:
    """Load and check everything, writing nothing.

    Returns the recorded message instead when this request id's reply was
    already sent — before the Gmail checks, so a replay still succeeds after
    Gmail has been disconnected.
    """
    async with AsyncSessionLocal() as db:
        inquiry = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
        if inquiry is None:
            raise LookupError(f"Inquiry {inquiry_id} not found")

        stale_claim: InquiryReplySend | None = None
        if request.client_request_id is not None:
            claim = await inquiry_reply_send_repo.get_by_key(
                db, inquiry_id=inquiry_id, client_request_id=request.client_request_id,
            )
            if claim is not None:
                if claim.request_hash != request_hash:
                    raise InquiryReplyRequestIdReusedError(
                        "This request id was already used for a different reply.",
                    )
                if claim.status == "sent":
                    return await _recorded_message(db, claim, inquiry_id)
                if not is_send_claim_stale(claim.claimed_at, _now()):
                    raise InquiryReplyInProgressError("This reply is being sent right now.")
                stale_claim = claim

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

        body = request.body
        if inquiry.listing_id is not None:
            listing = await listing_repo.get_by_id(db, inquiry.listing_id, organization_id)
            if listing is None:
                logger.warning(
                    "Inquiry %s points at a listing that's gone, so no pet disclosure can be added",
                    inquiry_id,
                )
            else:
                disclosure = reply_template_renderer.applicable_disclosure(
                    bool(listing.pets_on_premises), listing.large_dog_disclosure,
                )
                if disclosure:
                    earlier_replies = await inquiry_message_repo.list_outbound_bodies(db, inquiry_id)
                    already_told = any(
                        reply_template_renderer.contains_disclosure(disclosure, text)
                        for text in [body, *earlier_replies]
                    )
                    if not already_told:
                        body = reply_template_renderer.prepend_disclosure(disclosure, body)

        return ReplySendContext(
            integration=integration,
            from_address=user.email,
            to_address=to_address,
            body=body,
            original_email_message_id=inquiry.email_message_id,
            stale_claim=stale_claim,
        )


async def _record_reply(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    ctx: ReplySendContext,
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
        from_address=ctx.from_address,
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
                from_address=ctx.from_address,
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
        return await _claimed_reply(lost_claim_id, inquiry_id)
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


async def _claimed_reply(claim_id: uuid.UUID, inquiry_id: uuid.UUID) -> InquiryMessageResponse:
    """What became of a claim another attempt settled: its reply, or still in flight."""
    async with AsyncSessionLocal() as db:
        current = await inquiry_reply_send_repo.get_by_id(db, claim_id)
        if current is not None and current.status == "sent":
            return await _recorded_message(db, current, inquiry_id)
    raise InquiryReplyInProgressError("This reply is being sent right now.")


async def _release(claim_id: uuid.UUID, send_message_id: str) -> bool:
    async with unit_of_work() as db:
        return await inquiry_reply_send_repo.release(
            db, claim_id=claim_id, send_message_id=send_message_id,
        )


async def _settle_stale_claim(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    ctx: ReplySendContext,
    subject: str,
    claim: InquiryReplySend,
) -> InquiryMessageResponse | None:
    """Finish an earlier attempt Gmail did send, or release its claim. None once released."""
    try:
        gmail_id = await gmail_sent_lookup.find_by_message_id_header(
            ctx.integration, claim.send_message_id, purpose=_PURPOSE,
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
        return await _record_reply(
            organization_id=organization_id,
            user_id=user_id,
            inquiry_id=inquiry_id,
            ctx=ctx,
            subject=subject,
            gmail_id=gmail_id,
            claim=(claim.id, claim.send_message_id),
        )

    logger.warning("Reply claim %s is stale and Gmail has no such message; releasing it", claim.id)
    if not await _release(claim.id, claim.send_message_id):
        raise InquiryReplyInProgressError("This reply is being sent right now.")
    return None


async def send_reply(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    request: InquiryReplyRequest,
) -> InquiryMessageResponse:
    """Send a templated (or custom) reply via Gmail and record the outbound message.

    Raises the ``reply_exceptions`` errors; the route maps them to HTTP codes.
    """
    key = request.client_request_id
    request_hash = reply_request_hash(request)
    loaded = await _load(organization_id, user_id, inquiry_id, request, request_hash)
    if isinstance(loaded, InquiryMessageResponse):
        return loaded
    ctx = loaded

    if ctx.stale_claim is not None:
        settled = await _settle_stale_claim(
            organization_id=organization_id,
            user_id=user_id,
            inquiry_id=inquiry_id,
            ctx=ctx,
            subject=request.subject,
            claim=ctx.stale_claim,
        )
        if settled is not None:
            return settled

    send_message_id = make_msgid(domain=GMAIL_MESSAGE_ID_DOMAIN)
    claim: tuple[uuid.UUID, str] | None = None
    if key is not None:
        try:
            async with unit_of_work() as db:
                row = await inquiry_reply_send_repo.claim(
                    db,
                    inquiry_id=inquiry_id,
                    client_request_id=key,
                    request_hash=request_hash,
                    send_message_id=send_message_id,
                    claimed_at=_now(),
                )
                claim = (row.id, send_message_id)
        except ReplyAlreadyClaimedError as exc:
            raise InquiryReplyInProgressError("This reply is being sent right now.") from exc
    else:
        logger.info("Inquiry %s reply sent without a client request id (older app)", inquiry_id)

    try:
        gmail_id = await gmail_service.send_message(
            ctx.integration,
            from_address=ctx.from_address,
            to_address=ctx.to_address,
            subject=request.subject,
            body=ctx.body,
            message_id_header=send_message_id,
            in_reply_to_message_id=ctx.original_email_message_id,
        )
    except GmailSendOutcomeUnknownError as exc:
        logger.error(
            "Inquiry %s reply: Gmail outcome unknown; claim kept (Message-ID %s)",
            inquiry_id, send_message_id,
        )
        raise InquiryReplyUnconfirmedError(str(exc)) from exc
    except (GmailReauthRequiredError, GmailSendScopeError, GmailSendError) as exc:
        logger.warning("Inquiry %s reply refused by Gmail: %s", inquiry_id, exc)
        if claim is not None:
            await _release(*claim)
        if isinstance(exc, GmailReauthRequiredError):
            # needs_reauth is already set by send_message before raising.
            raise InquiryReplyAuthExpiredError(str(exc)) from exc
        if isinstance(exc, GmailSendScopeError):
            # Google may have revoked the scope between the check and the send.
            raise InquiryReplyMissingSendScopeError(str(exc)) from exc
        raise InquiryReplySendFailedError(str(exc)) from exc

    return await _record_reply(
        organization_id=organization_id,
        user_id=user_id,
        inquiry_id=inquiry_id,
        ctx=ctx,
        subject=request.subject,
        gmail_id=gmail_id,
        claim=claim,
    )
