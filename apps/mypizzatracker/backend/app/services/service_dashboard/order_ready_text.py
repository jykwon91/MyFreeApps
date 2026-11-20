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
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.drop.drop import Drop
from app.models.order.order import Order
from app.repositories.customer import customer_repo
from app.repositories.drop import drop_repo
from app.services.service_dashboard.ready_text import ReadyText
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


def send_ready_text(
    ready_text: ReadyText, order_id: uuid.UUID,
) -> tuple[bool, Optional[str]]:
    """Dispatch the order-ready SMS. Returns (sent_ok, error_message).

    Best-effort: every failure path returns ``(False, "<reason>")`` and
    logs at WARNING; the caller surfaces ``error_message`` to the
    operator. We never re-raise — the operator already advanced the
    order and a Twilio outage shouldn't block the dashboard.
    """
    if ready_text.skip_reason is not None:
        return False, ready_text.skip_reason
    try:
        sms_sender.send_sms_or_raise(ready_text.phone, ready_text.body)
    except SmsNotConfiguredError as e:
        logger.warning(
            "Ready-text SMS skipped (Twilio not configured) for order %s: %s",
            order_id, e,
        )
        return False, "SMS service is not configured"
    except SmsSendError as e:
        logger.warning(
            "Ready-text SMS rejected by Twilio for order %s: %s",
            order_id, e,
        )
        return False, str(e)
    except ValueError as e:
        logger.warning(
            "Ready-text SMS rejected (invalid args) for order %s: %s",
            order_id, e,
        )
        return False, str(e)
    return True, None
