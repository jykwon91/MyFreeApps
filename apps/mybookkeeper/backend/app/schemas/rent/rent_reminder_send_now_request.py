"""What the operator was looking at when they chose to send a reminder."""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.rent_reminder_channel import RentReminderChannel
from app.core.rent_reminder_enums import RENT_REMINDER_CHANNELS
from app.schemas.rent.rent_reminder_possibly_sent import RentReminderPossiblySent


class RentReminderSendNowRequest(BaseModel):
    due_date: _dt.date
    amount: Decimal = Field(max_digits=12, decimal_places=2)
    # ``send_now_message`` from the preview, not ``message``.
    message: str = Field(max_length=2000)
    channels: list[RentReminderChannel] = Field(min_length=1, max_length=len(RENT_REMINDER_CHANNELS))
    # The operator saw that these tries may already have reached the tenant
    # (``possibly_sent`` in the preview) and chose to send again. If the tries
    # have changed since, nothing is sent (412).
    confirmed_possibly_sent: list[RentReminderPossiblySent] = Field(
        default_factory=list, max_length=len(RENT_REMINDER_CHANNELS),
    )
