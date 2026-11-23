"""Email tenants' replies to rent reminder texts to the landlord who texted them.

Twilio posts every text sent to the reminder number to ``/sms/inbound``
(``SMS_INBOUND_PUBLIC_PATH``), signed like its status callbacks
(``sms_service.verify_inbound_message``).

**Whose reply it is.** Each reminder text's row keeps the lookup code of the
number it went to (``recipient_phone_hash``), so the sender's number is turned
into the same code and matched against the texts sent in the last
``REPLY_MATCH_WINDOW_DAYS``, without decrypting anyone's phone number. The
newest text's account gets the reply, unless another account texted the
number too close before it to tell (``rent_reminder_reply_routing``). The
match is then checked again: the landlord must still have an active account
and still belong to the organization, and the tenant must not have been
deleted. Nobody else is ever sent it.

**Nothing is stored.** The reply is emailed and forgotten; Twilio keeps its own
record. The email goes out after Twilio has been answered, because SMTP can
take longer than Twilio waits, and Twilio never needs to know how it went. A
number that texts in a loop gets ``REPLY_FORWARD_LIMIT`` emails an hour.

**Logs** name the MessageSid (and the matched send row) only: never the text,
nor the sender's number.

STOP, START and HELP are Twilio's to act on (it blocks or unblocks the number
itself); the email only explains what they mean for the landlord's texts.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from collections.abc import Mapping

from platform_shared.core.rate_limit import RateLimiter
from platform_shared.core.tracked_task import spawn_tracked
from platform_shared.services.phone_number import parse_e164
from platform_shared.services.twilio_opt_out import classify_opt_out
from platform_shared.services.twilio_webhook import parse_twilio_inbound_message
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rent_reminder_constants import (
    REPLY_FORWARD_LIMIT,
    REPLY_FORWARD_WINDOW_SECONDS,
    REPLY_MATCH_WINDOW_DAYS,
)
from app.core.security import phone_lookup_hash
from app.db.session import unit_of_work
from app.models.applicants.applicant import Applicant
from app.repositories.applicants import applicant_repo
from app.repositories.organization import organization_repo
from app.repositories.properties import property_repo
from app.repositories.rent import rent_reminder_send_repo, rent_schedule_repo
from app.repositories.rent.rent_reminder_reply_candidate import ReplyCandidate
from app.repositories.user import user_repo
from app.services.rent.rent_reminder_reply_email import ReplyEmail
from app.services.rent.rent_reminder_reply_email_builder import build_reply_email
from app.services.rent.rent_reminder_reply_outcome import ReplyOutcome
from app.services.rent.rent_reminder_reply_routing import choose_reply_target
from app.services.rent.rent_reminder_reply_target import ReplyTarget
from app.services.system import email_service, sms_service

logger = logging.getLogger(__name__)

_MATCH_WINDOW = _dt.timedelta(days=REPLY_MATCH_WINDOW_DAYS)
# How much of the sender's number the email shows.
_SHOWN_DIGITS = 4
_forward_limiter = RateLimiter(
    max_attempts=REPLY_FORWARD_LIMIT, window_seconds=REPLY_FORWARD_WINDOW_SECONDS,
)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def verify(*, query_string: str, params: Mapping[str, str], signature: str | None) -> None:
    """Raise ``TwilioWebhookAuthError`` unless Twilio sent this text for our account."""
    sms_service.verify_inbound_message(
        query_string=query_string, params=params, signature=signature,
    )


async def handle_message(
    params: Mapping[str, str], *, now: _dt.datetime | None = None,
) -> ReplyOutcome:
    """Pass one verified incoming text on to the landlord it answers, if any.

    Returns once the email is queued; it is sent in the background.
    """
    message = parse_twilio_inbound_message(params)
    sender = parse_e164(message.from_number)
    if sender is None or not sms_service.is_sending_number(message.to_number):
        logger.info("Incoming text is not a reply to a reminder text: sid=%s", message.message_sid)
        return "not_for_us"
    phone_hash = phone_lookup_hash(sender)
    since = (now or _now()) - _MATCH_WINDOW
    async with unit_of_work() as db:
        candidates = await rent_reminder_send_repo.list_reply_candidates(
            db, recipient_phone_hash=phone_hash, since=since,
        )
        if not candidates:
            logger.info("Incoming text matches no recent reminder text: sid=%s", message.message_sid)
            return "unmatched"
        target = choose_reply_target(candidates)
        if target is None:
            logger.info(
                "Incoming text not forwarded: more than one account texted that number "
                "recently: sid=%s",
                message.message_sid,
            )
            return "ambiguous"
        landlord_email = await _landlord_email(db, target)
        tenants = await _live_tenants(db, target)
        if landlord_email is None or not tenants:
            logger.info(
                "Incoming text not forwarded: its landlord or tenant is gone: sid=%s send_id=%s",
                message.message_sid, target.texts[0].send_id,
            )
            return "unreachable"
        # The tenant whose text to the number is newest; read before the
        # transaction ends, since the rows can't be loaded after it.
        text, tenant = tenants[0]
        tenant_id = tenant.id
        tenant_name = tenant.legal_name
        other_tenant_names = [other.legal_name for _, other in tenants[1:]]
        property_label = await _property_label(db, target.organization_id, tenant_id)

    if not _forward_limiter.try_acquire(f"twilio-reply:{phone_hash}"):
        logger.info(
            "Incoming text not forwarded: that number is over its hourly limit: sid=%s send_id=%s",
            message.message_sid, text.send_id,
        )
        return "over_limit"
    email = build_reply_email(
        tenant_name=tenant_name,
        other_tenant_names=other_tenant_names,
        due_date=text.due_date,
        property_label=property_label,
        body=message.body,
        opt_out=classify_opt_out(message.body, message.opt_out_type),
        media_content_types=message.media_content_types,
        sender_last_digits=sender[-_SHOWN_DIGITS:],
        tenant_page_url=_tenant_page_url(tenant_id),
    )
    spawn_tracked(
        _email_landlord(
            landlord_email, email, message_sid=message.message_sid, send_id=text.send_id,
        ),
        name="rent-reminder-reply-email",
    )
    logger.info(
        "Tenant reply queued for its landlord: sid=%s send_id=%s",
        message.message_sid, text.send_id,
    )
    return "forwarded"


def _tenant_page_url(applicant_id: uuid.UUID) -> str:
    return f"{(settings.app_url or settings.frontend_url).rstrip('/')}/tenants/{applicant_id}"


async def _landlord_email(db: AsyncSession, target: ReplyTarget) -> str | None:
    """The landlord's address, if their account is active and still in the organization."""
    user = await user_repo.get_by_id(db, target.user_id)
    if user is None or not user.is_active or not (user.email or "").strip():
        return None
    if await organization_repo.get_member(db, target.organization_id, target.user_id) is None:
        return None
    return user.email


async def _live_tenants(
    db: AsyncSession, target: ReplyTarget,
) -> list[tuple[ReplyCandidate, Applicant]]:
    """The target's tenants that weren't deleted, each with their newest text, newest first."""
    # Scoped like dispatch loads the tenant it texts: the send row's user is the plan's owner.
    applicants = await applicant_repo.list_by_ids(
        db,
        organization_id=target.organization_id,
        user_id=target.user_id,
        applicant_ids=[text.applicant_id for text in target.texts],
        include_deleted=False,
    )
    by_id = {applicant.id: applicant for applicant in applicants}
    return [(text, by_id[text.applicant_id]) for text in target.texts if text.applicant_id in by_id]


async def _property_label(
    db: AsyncSession, organization_id: uuid.UUID, applicant_id: uuid.UUID,
) -> str | None:
    """The tenant's property, when all their rent schedules are for the same one."""
    schedules = await rent_schedule_repo.list_for_applicant(
        db, organization_id=organization_id, applicant_id=applicant_id,
    )
    property_ids = {schedule.property_id for schedule in schedules}
    if len(property_ids) != 1:
        return None
    (property_id,) = property_ids
    if property_id is None:
        return None
    labels = await property_repo.get_labels_by_ids(db, organization_id, [property_id])
    return labels.get(property_id)


async def _email_landlord(
    landlord_email: str, email: ReplyEmail, *, message_sid: str | None, send_id: uuid.UUID,
) -> None:
    delivered = await email_service.send_email([landlord_email], email.subject, email.html)
    if not delivered:
        logger.warning(
            "Could not email a tenant's reply to its landlord: sid=%s send_id=%s",
            message_sid, send_id,
        )
