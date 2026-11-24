"""Apply httpSMS delivery webhooks to the reminder send log.

The phone reports back through four events:

- ``message.phone.sent``      -> ``sent`` (the phone handed it to the carrier)
- ``message.phone.delivered`` -> ``delivered`` (carrier delivery report)
- ``message.send.failed``     -> ``failed`` with the phone's error message
- ``message.send.expired``    -> ``failed`` (``expired``), once httpSMS gives up

Statuses only move forward, so out-of-order events (delivered before sent) are
harmless. The one backward move allowed is news about a row we marked failed
without knowing (the watchdog gave up, or httpSMS never confirmed the send): a
confirmation means the text did go out, and a failure from the phone means it
definitely didn't, so the row is corrected either way, and the operator, who
was told it may have gone out, is told it definitely didn't.

A failure from the phone is final. httpSMS only retries a message that
expired before the phone picked it up (``send.expired`` with
``is_final=false``); it never retries a failed one, and won't record it as
sent or delivered afterwards, so a definite failure is never reopened here.

A retry reuses the row, so every event is checked against the try it is
about: the ``request_id`` carries the try number, and an event for an older
try, or for a different httpSMS message than the row's, is ignored. Writes
only apply if the row is still as it was read, so a webhook racing Send now,
the sender or the watchdog never overwrites them. When that happens the row
is read again and the event decided afresh (a few times at most), so the
phone's news isn't dropped either.

Requests are authenticated by the JWT httpSMS signs with the webhook signing
key; anything unsigned or signed with a different key is rejected before the
body is read.
"""
from __future__ import annotations

import logging
from typing import Any, Literal

from platform_shared.core.audit_actor import audit_actor
from platform_shared.core.mask_phone_numbers import mask_phone_numbers
from platform_shared.services.httpsms_service import (
    HTTPSMS_EVENT_PHONE_DELIVERED,
    HTTPSMS_EVENT_PHONE_SENT,
    HTTPSMS_EVENT_SEND_EXPIRED,
    HTTPSMS_EVENT_SEND_FAILED,
    HttpSmsEvent,
    parse_httpsms_event,
    verify_httpsms_webhook,
)

from app.core.rent_reminder_constants import (
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    ERROR_SMS_EXPIRED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    PHONE_FAILED_CODE_PREFIX,
)
from app.core.rent_reminder_request_id import parse_reminder_request_id
from app.db.session import unit_of_work
from app.models.rent.rent_reminder_send import RentReminderSend
from app.repositories.rent import rent_reminder_send_repo
from app.services.rent import rent_reminder_alert_service as alerts
from app.services.system import sms_service

logger = logging.getLogger(__name__)

_SMS = "sms"
_STATUS_RANK: dict[str, int] = {"queued": 0, "sent_to_phone": 1, "sent": 2, "delivered": 3}
_CONFIRMED_STATUS: dict[str, str] = {
    HTTPSMS_EVENT_PHONE_SENT: "sent",
    HTTPSMS_EVENT_PHONE_DELIVERED: "delivered",
}
# Failures recorded by us for lack of news, which later news from the phone
# overrides in either direction.
_PRESUMED_FAILURES: frozenset[str] = frozenset({
    ERROR_NO_PHONE_CONFIRMATION, ERROR_SEND_INTERRUPTED, ERROR_SMS_OUTCOME_UNKNOWN,
})
_FAILABLE_STATUSES: frozenset[str] = frozenset({"queued", "sent_to_phone", "sent"})
# How often an event is decided again after the row changed under it.
_MAX_DECISIONS = 3
_Outcome = Literal["ignored", "confirmed", "failed", "raced"]
_HANDLED_EVENTS: frozenset[str] = frozenset({
    HTTPSMS_EVENT_PHONE_SENT,
    HTTPSMS_EVENT_PHONE_DELIVERED,
    HTTPSMS_EVENT_SEND_FAILED,
    HTTPSMS_EVENT_SEND_EXPIRED,
})


def verify(authorization: str | None) -> None:
    """Raise ``HttpSmsWebhookAuthError`` unless httpSMS signed this request."""
    verify_httpsms_webhook(
        authorization,
        signing_key=sms_service.webhook_signing_key(),
        audience=sms_service.webhook_url(),
    )


async def _find_row(
    db, event: HttpSmsEvent,
) -> tuple[RentReminderSend | None, int | None]:
    """The row an event is about, and the try it names (if it names one)."""
    parsed = parse_reminder_request_id(event.request_id)
    if parsed is not None:
        send_id, attempt = parsed
        row = await rent_reminder_send_repo.get(db, send_id=send_id)
        if row is not None and row.channel == _SMS:
            return row, attempt
    if event.message_id:
        row = await rent_reminder_send_repo.get_by_provider_message_id(
            db, provider_message_id=event.message_id,
        )
        return row, None
    return None, None


def _is_about_an_earlier_try(row: RentReminderSend, event: HttpSmsEvent, attempt: int | None) -> bool:
    if attempt is not None and attempt != row.attempt:
        logger.info(
            "Ignoring httpSMS %s for an earlier try: send_id=%s event_attempt=%s row_attempt=%s",
            event.event_type, row.id, attempt, row.attempt,
        )
        return True
    if event.message_id and row.provider_message_id and event.message_id != row.provider_message_id:
        logger.info(
            "Ignoring httpSMS %s for another message: send_id=%s attempt=%s",
            event.event_type, row.id, row.attempt,
        )
        return True
    return False


def _can_confirm(row, target: str) -> bool:
    if row.status == "failed":
        return row.error_code in _PRESUMED_FAILURES
    return _STATUS_RANK.get(target, -1) > _STATUS_RANK.get(row.status, -1)


def _can_fail(row) -> bool:
    if row.status == "failed":
        return row.error_code in _PRESUMED_FAILURES
    return row.status in _FAILABLE_STATUSES


async def _apply(
    db, row: RentReminderSend, event: HttpSmsEvent, attempt: int | None,
) -> tuple[_Outcome, bool]:
    """Decide on one event against the row as it is now, and write it.

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

    if event.event_type in _CONFIRMED_STATUS:
        target = _CONFIRMED_STATUS[event.event_type]
        if not _can_confirm(row, target):
            return "ignored", False
        if not await rent_reminder_send_repo.confirm_if_unchanged(
            db, row=row, status=target, **seen,
        ):
            return "raced", False
        return "confirmed", False

    if event.event_type == HTTPSMS_EVENT_SEND_EXPIRED:
        if not event.is_final:
            logger.info("httpSMS send expired, retrying: send_id=%s", row.id)
            return "ignored", False
        code = ERROR_SMS_EXPIRED
    else:
        # The phone's own words can quote the number it was sending to;
        # they are stored, shown and emailed to the operator.
        detail = mask_phone_numbers((event.error_message or "unknown").strip())
        code = f"{PHONE_FAILED_CODE_PREFIX}{detail}"

    if not _can_fail(row):
        return "ignored", False
    settled_unsure = row.status == "failed"
    if not await rent_reminder_send_repo.fail_if_unchanged(
        db, row=row, error_code=code, **seen,
    ):
        return "raced", False
    # The phone's words stay out of the log (they are stored, masked, on the row).
    logger.warning(
        "Rent reminder text failed on the phone: send_id=%s attempt=%s event=%s",
        row.id, row.attempt, event.event_type,
    )
    return "failed", settled_unsure


async def handle_event(payload: dict[str, Any], *, event_type_header: str | None) -> bool:
    """Apply one verified webhook. Returns True if a row changed.

    Call ``verify`` first. Unknown events and unknown messages are logged and
    acknowledged, so httpSMS does not retry them forever. httpSMS is not a
    signed-in user, so the writes are audited as the reminder's owner.
    """
    event = parse_httpsms_event(payload, event_type_header=event_type_header)
    if event.event_type not in _HANDLED_EVENTS:
        logger.info("Ignoring httpSMS event %s", event.event_type)
        return False

    async with unit_of_work() as db:
        row, attempt = await _find_row(db, event)
        if row is None:
            logger.warning(
                "httpSMS event for an unknown message: type=%s id=%s request_id=%s",
                event.event_type, event.message_id, event.request_id,
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
                "Gave up on httpSMS %s: the row kept changing: send_id=%s attempt=%s",
                event.event_type, row.id, row.attempt,
            )
            return False
        alert_id, alert_attempt = row.id, row.attempt

    if outcome == "failed":
        with audit_actor(owner_id):
            await alerts.alert_operator(alert_id, alert_attempt, settled_unsure=settled_unsure)
    return outcome in ("confirmed", "failed")
