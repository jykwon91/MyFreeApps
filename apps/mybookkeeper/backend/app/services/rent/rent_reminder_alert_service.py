"""Tell the operator, once, when a rent reminder didn't go out."""
from __future__ import annotations

import asyncio
import html
import logging
import uuid

from app.core.rent_reminder_constants import (
    ERROR_INVALID_PHONE,
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_NO_RECIPIENT,
    ERROR_SMS_EXPIRED,
    ERROR_SMS_NOT_CONFIGURED,
)
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.rent import rent_reminder_send_repo
from app.repositories.user import user_repo
from app.services.rent import rent_reminder_message as message
from app.services.system import email_service

logger = logging.getLogger(__name__)

_SMS = "sms"
ERROR_UNEXPECTED = "unexpected_error"

# Failures that mean "the phone never got it out", where the fix is on the
# phone itself rather than in the tenant's contact details.
PHONE_SIDE_ERRORS: frozenset[str] = frozenset({
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_SMS_EXPIRED,
})
_PHONE_CHECKLIST = (
    "Check the Android phone is on, online, and that httpSMS isn't "
    "battery-optimized (Settings > Apps > httpSMS > Battery > Unrestricted)."
)


async def operator_email(db, user_id: uuid.UUID) -> str | None:
    user = await user_repo.get_by_id(db, user_id)
    return user.email if user is not None else None


def email_html(body: str) -> str:
    return f"<p>{html.escape(body)}</p>"


def _alert_text(*, tenant: str, channel: str, code: str) -> tuple[str, str]:
    what = "rent text" if channel == _SMS else "rent reminder email"
    subject = f"{tenant}'s {what} didn't go out"
    if code in PHONE_SIDE_ERRORS:
        detail = _PHONE_CHECKLIST
    elif code == ERROR_NO_RECIPIENT:
        detail = f"The tenant record has no {'phone number' if channel == _SMS else 'email address'}."
    elif code == ERROR_INVALID_PHONE:
        detail = "The tenant's phone number couldn't be read. Re-enter it with the area code."
    elif code == ERROR_SMS_NOT_CONFIGURED:
        detail = "Text reminders are switched on but httpSMS isn't configured on the server."
    else:
        detail = f"Reason: {code}."
    body = (
        f"{subject}. {detail} You can retry it from the tenant's Rent reminders "
        "card with Send now."
    )
    return subject, body


async def alert_operator(send_id: uuid.UUID) -> bool:
    """Email the operator about a failed reminder, at most once per row."""
    async with unit_of_work() as db:
        row = await rent_reminder_send_repo.get(db, send_id=send_id)
        if row is None or row.status != "failed" or row.operator_alerted_at is not None:
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
        subject, body = _alert_text(
            tenant=tenant, channel=row.channel, code=row.error_code or ERROR_UNEXPECTED,
        )
    if not operator:
        logger.warning("Rent reminder %s failed and the operator has no email", send_id)
        return False
    delivered = await asyncio.to_thread(
        email_service.send_email, [operator], subject, email_html(body),
    )
    if not delivered:
        logger.warning("Could not email the operator about failed reminder %s", send_id)
        return False
    async with unit_of_work() as db:
        row = await rent_reminder_send_repo.get(db, send_id=send_id)
        if row is not None:
            await rent_reminder_send_repo.mark_operator_alerted(db, row=row)
    return True
