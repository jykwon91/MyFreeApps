"""Tell the operator, once per try, when a rent reminder didn't go out, or may
have gone out with nothing to confirm it.

The alert is claimed on the row before the email is sent, so the sender, the
watchdog and the webhook can't each email about the same failed try. A retry
is a new try and gets its own alert.

A failure we recorded without knowing ("may already have been sent") gets one
follow-up if the phone later reports the text definitely failed, so the
operator knows it's safe to send again.
"""
from __future__ import annotations

import html
import logging
import uuid

from app.core.rent_reminder_alert_messages import (
    CHECK_EMAIL,
    CHECK_TEXT,
    MISSING_CONTACT,
    RETRY,
    WHAT_HAPPENED,
)
from app.core.rent_reminder_constants import (
    ERROR_NO_RECIPIENT,
    ERROR_UNEXPECTED,
    MAY_STILL_ARRIVE_ERRORS,
    PHONE_FAILED_CODE_PREFIX,
    SMS_RELAY_CODE_PREFIX,
)
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.rent import rent_reminder_send_repo
from app.repositories.user import user_repo
from app.services.rent import rent_reminder_message as message
from app.services.system import email_service

logger = logging.getLogger(__name__)

_SMS = "sms"


async def operator_email(db, user_id: uuid.UUID) -> str | None:
    user = await user_repo.get_by_id(db, user_id)
    return user.email if user is not None else None


def email_html(body: str) -> str:
    return f"<p>{html.escape(body)}</p>"


def _settled_text(*, tenant: str, code: str) -> tuple[str, str]:
    subject = f"{tenant}'s rent text definitely didn't go out"
    body = (
        f"{subject}. Earlier it looked like it might have reached them. "
        f"{_what_happened(channel=_SMS, code=code)} It definitely didn't go out, "
        "so you can send it again with Send now on the tenant's Rent reminders card."
    )
    return subject, body


def _what_happened(*, channel: str, code: str) -> str:
    """Why the reminder failed, as the operator would put it, and what to fix
    first, if anything."""
    if code == ERROR_NO_RECIPIENT:
        return f"The tenant record has no {MISSING_CONTACT[channel]}."
    # The table before the prefixes: some codes with a fixed spelling start
    # with ``sms_`` too (``sms_network_error``, ``sms_http_401``) and have
    # words of their own.
    if code in WHAT_HAPPENED:
        return WHAT_HAPPENED[code]
    if code.startswith(PHONE_FAILED_CODE_PREFIX):
        detail = code.removeprefix(PHONE_FAILED_CODE_PREFIX)
        return f"The phone reported a problem sending the text ({detail}). Check the httpSMS app on the phone."
    if code.startswith(SMS_RELAY_CODE_PREFIX):
        return f"httpSMS refused the text ({code.removeprefix(SMS_RELAY_CODE_PREFIX)})."
    return f"Reason: {code}."


def _alert_text(*, tenant: str, channel: str, code: str) -> tuple[str, str]:
    what = "rent text" if channel == _SMS else "rent reminder email"
    if code in MAY_STILL_ARRIVE_ERRORS:
        subject = f"{tenant}'s {what} may already have been sent"
        check = CHECK_TEXT if channel == _SMS else CHECK_EMAIL
        next_step = f"It may already have reached them, so {check} before sending it again. {RETRY}"
    else:
        subject = f"{tenant}'s {what} didn't go out"
        next_step = RETRY
    body = f"{subject}. {_what_happened(channel=channel, code=code)} {next_step}"
    return subject, body


async def alert_operator(
    send_id: uuid.UUID, attempt: int, *, settled_unsure: bool = False,
) -> bool:
    """Email the operator about try ``attempt`` of a failed reminder, at most once.

    ``settled_unsure``: the row had been failed as "may have gone out" and the
    phone has now said it definitely didn't (the row's alert mark was cleared
    for this one follow-up).
    """
    async with unit_of_work() as db:
        row = await rent_reminder_send_repo.get(db, send_id=send_id)
        if row is None or row.status != "failed" or row.attempt != attempt:
            return False
        applicant = await applicant_repo.get(
            db,
            applicant_id=row.applicant_id,
            organization_id=row.organization_id,
            user_id=row.user_id,
            include_deleted=True,
        )
        legal_name = applicant.legal_name if applicant is not None else None
        tenant = message.first_name(legal_name) if (legal_name or "").strip() else "A tenant"
        operator = await operator_email(db, row.user_id)
        code = row.error_code or ERROR_UNEXPECTED
        subject, body = (
            _settled_text(tenant=tenant, code=code)
            if settled_unsure
            else _alert_text(tenant=tenant, channel=row.channel, code=code)
        )
        if not operator:
            logger.warning("Rent reminder %s failed and the operator has no email", send_id)
            return False
        claimed_at = await rent_reminder_send_repo.claim_operator_alert(
            db, row=row, attempt=attempt,
        )
    if claimed_at is None:
        return False
    delivered = await email_service.send_email(
        [operator], subject, email_html(body),
    )
    if not delivered:
        logger.warning("Could not email the operator about failed reminder %s", send_id)
        async with unit_of_work() as db:
            row = await rent_reminder_send_repo.get(db, send_id=send_id)
            if row is not None:
                await rent_reminder_send_repo.release_operator_alert(
                    db, row=row, attempt=attempt, claimed_at=claimed_at,
                )
        return False
    return True
