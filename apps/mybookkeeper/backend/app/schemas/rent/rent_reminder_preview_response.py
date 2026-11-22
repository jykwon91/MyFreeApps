"""The next reminder a plan will send, rendered exactly as it will go out."""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.rent.rent_reminder_possibly_sent import RentReminderPossiblySent


class RentReminderPreviewResponse(BaseModel):
    due_date: _dt.date
    # The moment it becomes sendable, in the plan's timezone.
    send_at: _dt.datetime
    amount: Decimal
    # The rent charge period the amount comes from.
    period_start: _dt.date
    period_end: _dt.date
    # As it will read on the day it goes out on schedule.
    message: str
    # As it would read if the operator sent it right now.
    send_now_message: str
    # Channels that already went out (or are in flight) for this due date.
    # A failed send is not listed: it can be retried with send-now.
    sent_channels: list[str]
    # Enabled channels whose failed try may still have reached the tenant:
    # Send now must warn, and be confirmed by echoing these back in
    # ``confirmed_possibly_sent``, before resending.
    possibly_sent: list[RentReminderPossiblySent]
