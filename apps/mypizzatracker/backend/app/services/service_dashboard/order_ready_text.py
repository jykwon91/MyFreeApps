"""Order-ready SMS for the ``ready_text_sent`` transition.

Split in two so a text can only go out for a status change that was saved:
``compose_ready_text`` reads what the message needs inside the transition's
transaction, and ``send_ready_text`` is called only after that transaction
commits. If the commit fails nothing is sent, and once it succeeds a repeat
advance to ``ready_text_sent`` is a no-op, so the customer is texted once.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ready_text_messages import READY_TEXT_NOT_CONFIGURED_REASON
from app.models.drop.drop import Drop
from app.models.order.order import Order
from app.repositories.customer import customer_repo
from app.repositories.drop import drop_repo
from app.services.service_dashboard.ready_text import ReadyText
from app.services.service_dashboard.ready_text_failure_reason import ready_text_failure_reason
from app.services.service_dashboard.ready_text_outcome import ReadyTextOutcome
from app.services.sms import sms_sender
from app.services.sms.order_ready_notification import render_order_ready_body
from platform_shared.services.sms_service import (
    SmsNotConfiguredError,
    SmsSendError,
)

logger = logging.getLogger(__name__)


async def compose_ready_text(db: AsyncSession, order: Order, drop: Drop) -> ReadyText:
    customer = await customer_repo.get_customer_by_id(db, order.customer_id)
    slot = await drop_repo.get_slot(db, order.slot_id)
    if customer is None or slot is None:
        # Should be impossible given the FK constraints, but the SMS
        # path is best-effort by design — log + skip rather than raise.
        logger.warning(
            "Skipping ready-text SMS: missing customer or slot for order %s",
            order.id,
        )
        return ReadyText(skip_reason="Customer or slot missing; cannot text")
    if not customer.phone:
        return ReadyText(skip_reason="Customer has no phone number on file")
    return ReadyText(
        phone=customer.phone,
        body=render_order_ready_body(
            customer_name=customer.name,
            drop_name=drop.name,
            pickup_time=slot.pickup_time,
        ),
    )


def send_ready_text(ready_text: ReadyText, order_id: uuid.UUID) -> ReadyTextOutcome:
    """Dispatch the order-ready SMS.

    Best-effort: every failure path returns ``sent=False`` with a fixed reason
    and logs the real error (with Twilio's codes) at WARNING; the caller surfaces it to the operator. We never
    re-raise — the operator already advanced the order and a Twilio outage
    shouldn't block the dashboard. A failure that may still have reached the
    customer is flagged ``outcome_unknown`` so the operator checks before
    texting them by hand.
    """
    if ready_text.skip_reason is not None:
        return ReadyTextOutcome(sent=False, error=ready_text.skip_reason)
    try:
        sms_sender.send_sms_or_raise(ready_text.phone, ready_text.body)
    except SmsNotConfiguredError as e:
        logger.warning(
            "Ready-text SMS skipped (Twilio not configured) for order %s: %s",
            order_id, e,
        )
        return ReadyTextOutcome(sent=False, error=READY_TEXT_NOT_CONFIGURED_REASON)
    except SmsSendError as e:
        logger.warning(
            "Ready-text SMS failed for order %s: code=%s status=%s provider_code=%s outcome_unknown=%s: %s",
            order_id, e.code, e.status, e.provider_code, e.outcome_unknown, e,
        )
        return ReadyTextOutcome(
            sent=False, error=ready_text_failure_reason(e), outcome_unknown=e.outcome_unknown,
        )
    except ValueError as e:
        # Only our own argument checks raise this, so its wording is ours.
        logger.warning(
            "Ready-text SMS rejected (invalid args) for order %s: %s",
            order_id, e,
        )
        return ReadyTextOutcome(sent=False, error=str(e))
    return ReadyTextOutcome(sent=True)
