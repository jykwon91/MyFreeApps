"""What the operator was looking at when they chose to send a reminder."""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class RentReminderSendNowRequest(BaseModel):
    due_date: _dt.date
    amount: Decimal = Field(max_digits=12, decimal_places=2)
    # ``send_now_message`` from the preview, not ``message``.
    message: str = Field(max_length=2000)
    channels: list[Literal["email", "sms"]] = Field(min_length=1, max_length=2)
