"""One row of a tenant's reminder history."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class RentReminderSendResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    due_date: _dt.date
    channel: str
    status: str
    amount: Decimal
    error_code: str | None = None
    created_at: _dt.datetime
    sent_at: _dt.datetime | None = None
    confirmed_at: _dt.datetime | None = None
