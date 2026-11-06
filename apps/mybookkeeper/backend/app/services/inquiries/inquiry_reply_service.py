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
      released and this attempt sends;
    - unless the claim went through a Gmail account that's no longer the
      connected one (``InquiryReplySentFromOtherGmailError``): that mailbox
      can't be searched, so the claim is kept and nothing is sent.

    Each claim records the Gmail address it sends through
    (``reply_claim_settlement``).

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

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.repositories import (
    inquiry_message_repo,
    inquiry_repo,
    inquiry_reply_send_repo,
    integration_repo,
)
from app.repositories.inquiries.reply_already_claimed_error import ReplyAlreadyClaimedError
from app.repositories.listings import listing_repo
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse
from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest
from app.services.email import gmail_mailbox, gmail_service
from app.services.email.constants import GMAIL_MESSAGE_ID_DOMAIN, GMAIL_PURPOSE_SEND_REPLIES
from app.services.email.exceptions import (
    GmailAccountUnknownError,
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
    InquiryReplyUnconfirmedError,
)
from app.services.inquiries.reply_claim_settlement import release, settle_stale_claim
from app.services.inquiries.reply_recording import record_reply, recorded_message
from app.services.inquiries.reply_request_hash import reply_request_hash
from app.services.inquiries.reply_send_context import ReplySendContext
from app.services.integrations import integration_service

logger = logging.getLogger(__name__)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


async def _load(
    organization_id: uuid.UUID,
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
                    return await recorded_message(db, claim, inquiry_id)
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
            to_address=to_address,
            body=body,
            original_email_message_id=inquiry.email_message_id,
            stale_claim=stale_claim,
        )


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
    loaded = await _load(organization_id, inquiry_id, request, request_hash)
    if isinstance(loaded, InquiryMessageResponse):
        return loaded
    ctx = loaded

    # The reply goes out from the connected Gmail account, not the login email,
    # which that account may not be able to send as. A claim records the same
    # address, so it is only ever settled by searching that account's mailbox.
    try:
        sender_address = await gmail_mailbox.ensure_gmail_address(
            ctx.integration, purpose=GMAIL_PURPOSE_SEND_REPLIES,
        )
    except GmailReauthRequiredError as exc:
        raise InquiryReplyAuthExpiredError(str(exc)) from exc
    except GmailAccountUnknownError as exc:
        raise InquiryReplySendFailedError(str(exc)) from exc

    if ctx.stale_claim is not None:
        settled = await settle_stale_claim(
            organization_id=organization_id,
            user_id=user_id,
            inquiry_id=inquiry_id,
            ctx=ctx,
            subject=request.subject,
            claim=ctx.stale_claim,
            connected_address=sender_address,
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
                    sender_gmail_address=sender_address,
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
            from_address=sender_address,
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
            await release(*claim)
        if isinstance(exc, GmailReauthRequiredError):
            # needs_reauth is already set by send_message before raising.
            raise InquiryReplyAuthExpiredError(str(exc)) from exc
        if isinstance(exc, GmailSendScopeError):
            # Google may have revoked the scope between the check and the send.
            raise InquiryReplyMissingSendScopeError(str(exc)) from exc
        raise InquiryReplySendFailedError(str(exc)) from exc

    return await record_reply(
        organization_id=organization_id,
        user_id=user_id,
        inquiry_id=inquiry_id,
        ctx=ctx,
        from_address=sender_address,
        subject=request.subject,
        gmail_id=gmail_id,
        claim=claim,
    )
