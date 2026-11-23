"""Tell the operator, once per try, when a rent reminder didn't go out.

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

from app.core.rent_reminder_constants import (
    ERROR_EMAIL_OUTCOME_UNKNOWN,
    ERROR_INVALID_PHONE,
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_NO_RECIPIENT,
    ERROR_SMS_EXPIRED,
    ERROR_SMS_NETWORK,
    ERROR_SMS_NOT_CONFIGURED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_UNEXPECTED,
    MAY_STILL_ARRIVE_ERRORS,
)
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.rent import rent_reminder_send_repo
from app.repositories.user import user_repo
from app.services.rent import rent_reminder_message as message
from app.services.system import email_service

logger = logging.getLogger(__name__)

_SMS = "sms"

# Failures that mean "the phone never got it out", where the fix is on the
# phone itself rather than in the tenant's contact details.
PHONE_SIDE_ERRORS: frozenset[str] = frozenset({
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_SMS_EXPIRED,
})
_OUTCOME_UNKNOWN_ERRORS: frozenset[str] = frozenset({
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_EMAIL_OUTCOME_UNKNOWN,
})
_CHECK_PROVIDER_LOG = (
    "It may already have been sent, so check the message log on httpsms.com "
    "(or the phone's Messages app) before sending it again."
)
_ASK_TENANT = (
    "It may already be in their inbox, and an email can't be looked up "
    "anywhere, so ask the tenant whether it arrived before sending it again."
)
_PHONE_CHECKLIST = (
    "Check the Android phone is on, online, and that httpSMS isn't "
    "battery-optimized (Settings > Apps > httpSMS > Battery > Unrestricted)."
)


async def operator_email(db, user_id: uuid.UUID) -> str | None:
    user = await user_repo.get_by_id(db, user_id)
    return user.email if user is not None else None


def email_html(body: str) -> str:
    return f"<p>{html.escape(body)}</p>"


def _settled_text(*, tenant: str, code: str) -> tuple[str, str]:
    subject = f"{tenant}'s rent text definitely didn't go out"
    body = (
        f"{subject}. Earlier it looked like it might have reached them, but the "
        f"phone has now reported it failed (reason: {code}). It definitely didn't "
        "go out, so you can send it again with Send now on the tenant's Rent "
        "reminders card."
    )
    return subject, body


def _alert_text(*, tenant: str, channel: str, code: str) -> tuple[str, str]:
    what = "rent text" if channel == _SMS else "rent reminder email"
    outcome = "may already have been sent" if code in _OUTCOME_UNKNOWN_ERRORS else "didn't go out"
    subject = f"{tenant}'s {what} {outcome}"
    if code in PHONE_SIDE_ERRORS:
        detail = _PHONE_CHECKLIST
    elif code == ERROR_NO_RECIPIENT:
        detail = f"The tenant record has no {'phone number' if channel == _SMS else 'email address'}."
    elif code == ERROR_INVALID_PHONE:
        detail = "The tenant's phone number couldn't be read. Re-enter it with the area code."
    elif code == ERROR_SMS_NOT_CONFIGURED:
        detail = "Text reminders are switched on but httpSMS isn't configured on the server."
    elif code == ERROR_SMS_NETWORK:
        detail = "The server couldn't reach httpSMS, so the text wasn't sent."
    elif code == ERROR_SMS_OUTCOME_UNKNOWN:
        detail = "httpSMS didn't confirm it took the text."
    elif code == ERROR_EMAIL_OUTCOME_UNKNOWN:
        detail = "The mail server didn't confirm it took the email."
    else:
        detail = f"Reason: {code}."
    retry = (
        "If nothing else went out for this due date, you can retry from the "
        "tenant's Rent reminders card with Send now. If the other channel did go "
        "out, Send now won't resend this one, so contact the tenant yourself if "
        "they still need it."
    )
    if code == ERROR_SMS_OUTCOME_UNKNOWN:
        retry = f"{_CHECK_PROVIDER_LOG} {retry}"
    elif code == ERROR_EMAIL_OUTCOME_UNKNOWN:
        retry = f"{_ASK_TENANT} {retry}"
    elif code in MAY_STILL_ARRIVE_ERRORS:
        retry = f"It may still reach them, so check before sending again. {retry}"
    body = f"{subject}. {detail} {retry}"
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
