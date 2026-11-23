"""Apply Twilio status callbacks to the reminder send log.

Twilio POSTs each text's status changes to the callback URL it was sent with:

- ``sent``                     -> ``sent`` (Twilio handed it to the carrier)
- ``delivered``                -> ``delivered`` (carrier delivery report)
- ``undelivered`` / ``failed`` -> ``failed`` with ``sms_failed: <ErrorCode>``

``queued`` / ``sending`` / ``accepted`` (and anything else) are steps before
the carrier has it, and are acknowledged without a change.

Statuses only move forward, so out-of-order callbacks (delivered before sent)
are harmless. The one backward move allowed is news about a row we marked
failed without knowing (the watchdog gave up, or Twilio never confirmed the
send): a confirmation means the text did go out, and a failure from Twilio
means it definitely didn't, so the row is corrected either way, and the
operator, who was told it may have gone out, is told it definitely didn't.

A failure from Twilio is final: Twilio doesn't retry a failed or undelivered
message, so a definite failure is never reopened here.

A retry reuses the row, so every callback is checked against the try it is
about: the callback URL's ``request_id`` carries the try number, and a
callback for an older try, or for a different Twilio message than the row's,
is ignored. Writes only apply if the row is still as it was read, so a
callback racing Send now, the sender or the watchdog never overwrites them.
When that happens the row is read again and the callback decided afresh (a
few times at most), so Twilio's news isn't dropped either. A callback also
stores the try's Message SID if the row doesn't have it yet (the send's answer
was lost, or the callback beat the sender's own write).

Requests are authenticated by ``X-Twilio-Signature``
(``sms_service.verify_status_callback``); anything unsigned or signed with
another auth token is rejected before the parameters are acted on.
"""
from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Literal

from platform_shared.core.audit_actor import audit_actor
from platform_shared.core.sms_constants import (
    TWILIO_STATUS_DELIVERED,
    TWILIO_STATUS_FAILED,
    TWILIO_STATUS_SENT,
    TWILIO_STATUS_UNDELIVERED,
)
from platform_shared.services.twilio_webhook import (
    TwilioStatusEvent,
    parse_twilio_status_callback,
)

from app.core.rent_reminder_constants import (
    ERROR_NO_SMS_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    SMS_FAILED_CODE_PREFIX,
    SMS_FAILED_UNKNOWN_DETAIL,
)
from app.core.rent_reminder_enums import RENT_REMINDER_CHANNEL_SMS
from app.core.rent_reminder_request_id import parse_reminder_request_id
from app.core.twilio_error_code import is_twilio_error_code
from app.db.session import unit_of_work
from app.models.rent.rent_reminder_send import RentReminderSend
from app.repositories.rent import rent_reminder_send_repo
from app.services.rent import rent_reminder_alert_service as alerts
from app.services.system import sms_service

logger = logging.getLogger(__name__)

_STATUS_RANK: dict[str, int] = {"queued": 0, "sent_to_provider": 1, "sent": 2, "delivered": 3}
_CONFIRMED_STATUS: dict[str, str] = {
    TWILIO_STATUS_SENT: "sent",
    TWILIO_STATUS_DELIVERED: "delivered",
}
_FAILED_STATUSES: frozenset[str] = frozenset({TWILIO_STATUS_UNDELIVERED, TWILIO_STATUS_FAILED})
_HANDLED_STATUSES: frozenset[str] = frozenset(_CONFIRMED_STATUS) | _FAILED_STATUSES
# Failures recorded by us for lack of news, which later news from Twilio
# overrides in either direction.
_PRESUMED_FAILURES: frozenset[str] = frozenset({
    ERROR_NO_SMS_CONFIRMATION, ERROR_SEND_INTERRUPTED, ERROR_SMS_OUTCOME_UNKNOWN,
})
_FAILABLE_STATUSES: frozenset[str] = frozenset({"queued", "sent_to_provider", "sent"})
# How often a callback is decided again after the row changed under it.
_MAX_DECISIONS = 3
_Outcome = Literal["ignored", "confirmed", "failed", "raced"]


def verify(*, query_string: str, params: Mapping[str, str], signature: str | None) -> None:
    """Raise ``TwilioWebhookAuthError`` unless Twilio signed this callback."""
    sms_service.verify_status_callback(
        query_string=query_string, params=params, signature=signature,
    )


def failure_code(twilio_error_code: str | None) -> str:
    """The row's code for a text Twilio couldn't deliver: ``sms_failed: 30007``."""
    detail = (twilio_error_code or "").strip()
    if not is_twilio_error_code(detail):
        detail = SMS_FAILED_UNKNOWN_DETAIL
    return f"{SMS_FAILED_CODE_PREFIX}{detail}"


async def _find_row(
    db, event: TwilioStatusEvent, request_id: str | None,
) -> tuple[RentReminderSend | None, int | None]:
    """The row a callback is about, and the try it names (if it names one)."""
    parsed = parse_reminder_request_id(request_id)
    if parsed is not None:
        send_id, attempt = parsed
        row = await rent_reminder_send_repo.get(db, send_id=send_id)
        if row is not None and row.channel == RENT_REMINDER_CHANNEL_SMS:
            return row, attempt
    if event.message_sid:
        row = await rent_reminder_send_repo.get_by_provider_message_id(
            db, provider_message_id=event.message_sid,
        )
        return row, None
    return None, None


def _is_about_an_earlier_try(
    row: RentReminderSend, event: TwilioStatusEvent, attempt: int | None,
) -> bool:
    if attempt is not None and attempt != row.attempt:
        logger.info(
            "Ignoring Twilio %s for an earlier try: send_id=%s event_attempt=%s row_attempt=%s",
            event.status, row.id, attempt, row.attempt,
        )
        return True
    if event.message_sid and row.provider_message_id and event.message_sid != row.provider_message_id:
        logger.info(
            "Ignoring Twilio %s for another message: send_id=%s attempt=%s",
            event.status, row.id, row.attempt,
        )
        return True
    return False


def _can_confirm(row: RentReminderSend, target: str) -> bool:
    if row.status == "failed":
        return row.error_code in _PRESUMED_FAILURES
    return _STATUS_RANK.get(target, -1) > _STATUS_RANK.get(row.status, -1)


def _can_fail(row: RentReminderSend) -> bool:
    if row.status == "failed":
        return row.error_code in _PRESUMED_FAILURES
    return row.status in _FAILABLE_STATUSES


async def _apply(
    db, row: RentReminderSend, event: TwilioStatusEvent, attempt: int | None,
) -> tuple[_Outcome, bool]:
    """Decide on one callback against the row as it is now, and write it.

    Returns the outcome and whether a failure settles a try we had marked
    "may have gone out". ``raced`` means the row changed before the write;
    ``row`` has been refreshed, so the caller can decide again.
    """
    if _is_about_an_earlier_try(row, event, attempt):
        return "ignored", False
    seen = {
        "seen_status": row.status,
        "seen_error_code": row.error_code,
        "seen_attempt": row.attempt,
    }
    # A try can be missing its Message SID: the send's answer was lost, or
    # this callback beat the sender's own write. Twilio names it here.
    new_message_id = None if row.provider_message_id else event.message_sid

    if event.status in _CONFIRMED_STATUS:
        target = _CONFIRMED_STATUS[event.status]
        if not _can_confirm(row, target):
            return "ignored", False
        if not await rent_reminder_send_repo.confirm_if_unchanged(
            db, row=row, status=target, provider_message_id=new_message_id, **seen,
        ):
            return "raced", False
        return "confirmed", False

    code = failure_code(event.error_code)
    if not _can_fail(row):
        return "ignored", False
    settled_unsure = row.status == "failed"
    if not await rent_reminder_send_repo.fail_if_unchanged(
        db, row=row, error_code=code, provider_message_id=new_message_id, **seen,
    ):
        return "raced", False
    logger.warning(
        "Rent reminder text not delivered: send_id=%s attempt=%s status=%s code=%s",
        row.id, row.attempt, event.status, code,
    )
    return "failed", settled_unsure


async def handle_event(params: Mapping[str, str], *, request_id: str | None) -> bool:
    """Apply one verified status callback's form parameters. Returns True if a row changed.

    Call ``verify`` first. Other statuses and unknown messages are logged and
    acknowledged too: Twilio doesn't retry a status callback, but it records
    any answer other than a 2xx as an error (11200) in its debugger, where
    those would bury real problems. Twilio is not a signed-in user, so the
    writes are audited as the reminder's owner.
    """
    event = parse_twilio_status_callback(params)
    if event.status not in _HANDLED_STATUSES:
        logger.info("Ignoring Twilio status %s", event.status or "(none)")
        return False

    async with unit_of_work() as db:
        row, attempt = await _find_row(db, event, request_id)
        if row is None:
            logger.warning(
                "Twilio status for an unknown message: status=%s sid=%s request_id=%s",
                event.status, event.message_sid, request_id,
            )
            return False
        owner_id = row.user_id
        with audit_actor(owner_id):
            for _ in range(_MAX_DECISIONS):
                outcome, settled_unsure = await _apply(db, row, event, attempt)
                if outcome != "raced":
                    break
        if outcome == "raced":
            logger.warning(
                "Gave up on Twilio %s: the row kept changing: send_id=%s attempt=%s",
                event.status, row.id, row.attempt,
            )
            return False
        alert_id, alert_attempt = row.id, row.attempt

    if outcome == "failed":
        with audit_actor(owner_id):
            await alerts.alert_operator(alert_id, alert_attempt, settled_unsure=settled_unsure)
    return outcome in ("confirmed", "failed")
