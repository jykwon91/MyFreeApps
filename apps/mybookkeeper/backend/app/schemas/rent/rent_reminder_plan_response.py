"""A tenant's rent-reminder plan as returned to the client."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class RentReminderPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    applicant_id: uuid.UUID
    frequency: str
    due_weekday: int | None = None
    send_days_before: int
    send_time: _dt.time
    timezone: str
    email_enabled: bool
    sms_enabled: bool
    amount_override: Decimal | None = None
    payment_instructions: str | None = None
    is_active: bool
    created_at: _dt.datetime
    updated_at: _dt.datetime
