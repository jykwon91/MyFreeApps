"""Apply httpSMS delivery webhooks to the reminder send log.

The phone reports back through four events:

- ``message.phone.sent``      -> ``sent`` (the phone handed it to the carrier)
- ``message.phone.delivered`` -> ``delivered`` (carrier delivery report)
- ``message.send.failed``     -> ``failed`` with the phone's error message
- ``message.send.expired``    -> ``failed`` (``expired``), once httpSMS gives up

Statuses only move forward, so out-of-order events (delivered before sent) are
harmless. The one backward move allowed is a confirmation arriving after the
watchdog already gave up: the text did go out, so the row is corrected.

Requests are authenticated by the JWT httpSMS signs with the webhook signing
key; anything unsigned or signed with a different key is rejected before the
body is read.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

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
)
from app.db.session import unit_of_work
from app.repositories.rent import rent_reminder_send_repo
from app.services.rent import rent_reminder_alert_service as alerts
from app.services.system import sms_service

logger = logging.getLogger(__name__)

_SMS = "sms"
_PHONE_FAILED_PREFIX = "phone_failed"
_STATUS_RANK: dict[str, int] = {"queued": 0, "sent_to_phone": 1, "sent": 2, "delivered": 3}
_CONFIRMED_STATUS: dict[str, str] = {
    HTTPSMS_EVENT_PHONE_SENT: "sent",
    HTTPSMS_EVENT_PHONE_DELIVERED: "delivered",
}
# Failures recorded by us for lack of news, which a late confirmation overrides.
_PRESUMED_FAILURES: frozenset[str] = frozenset({
    ERROR_NO_PHONE_CONFIRMATION, ERROR_SEND_INTERRUPTED,
})
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


async def _find_row(db, event: HttpSmsEvent):
    if event.request_id:
        try:
            send_id = uuid.UUID(event.request_id)
        except ValueError:
            send_id = None
        if send_id is not None:
            row = await rent_reminder_send_repo.get(db, send_id=send_id)
            if row is not None and row.channel == _SMS:
                return row
    if event.message_id:
        return await rent_reminder_send_repo.get_by_provider_message_id(
            db, provider_message_id=event.message_id,
        )
    return None


def _can_confirm(row, target: str) -> bool:
    if row.status == "failed":
        return row.error_code in _PRESUMED_FAILURES
    return _STATUS_RANK.get(target, -1) > _STATUS_RANK.get(row.status, -1)


async def handle_event(payload: dict[str, Any], *, event_type_header: str | None) -> bool:
    """Apply one verified webhook. Returns True if a row changed.

    Call ``verify`` first. Unknown events and unknown messages are logged and
    acknowledged, so httpSMS does not retry them forever.
    """
    event = parse_httpsms_event(payload, event_type_header=event_type_header)
    if event.event_type not in _HANDLED_EVENTS:
        logger.info("Ignoring httpSMS event %s", event.event_type)
        return False

    alert_id: uuid.UUID | None = None
    async with unit_of_work() as db:
        row = await _find_row(db, event)
        if row is None:
            logger.warning(
                "httpSMS event for an unknown message: type=%s id=%s request_id=%s",
                event.event_type, event.message_id, event.request_id,
            )
            return False

        if event.event_type in _CONFIRMED_STATUS:
            target = _CONFIRMED_STATUS[event.event_type]
            if not _can_confirm(row, target):
                return False
            await rent_reminder_send_repo.mark_confirmed(db, row=row, status=target)
            return True

        if event.event_type == HTTPSMS_EVENT_SEND_EXPIRED:
            if not event.is_final:
                logger.info("httpSMS send expired, retrying: send_id=%s", row.id)
                return False
            code = ERROR_SMS_EXPIRED
        else:
            detail = (event.error_message or "unknown").strip()
            code = f"{_PHONE_FAILED_PREFIX}: {detail}"

        if row.status not in ("queued", "sent_to_phone", "sent"):
            return False
        logger.warning(
            "Rent reminder text failed on the phone: send_id=%s event=%s code=%s",
            row.id, event.event_type, code,
        )
        await rent_reminder_send_repo.mark_failed(db, row=row, error_code=code)
        alert_id = row.id

    if alert_id is not None:
        await alerts.alert_operator(alert_id)
    return True
