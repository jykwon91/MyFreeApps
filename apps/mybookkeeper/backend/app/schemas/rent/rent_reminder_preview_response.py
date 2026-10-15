"""The next reminder a plan will send, rendered exactly as it will go out."""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel


class RentReminderPreviewResponse(BaseModel):
    due_date: _dt.date
    # The moment it becomes sendable, in the plan's timezone.
    send_at: _dt.datetime
    amount: Decimal
    # The rent charge period the amount comes from.
    period_start: _dt.date
    period_end: _dt.date
    message: str
    # Channels that already went out (or are in flight) for this due date.
    # A failed send is not listed: it can be retried with send-now.
    sent_channels: list[str]
