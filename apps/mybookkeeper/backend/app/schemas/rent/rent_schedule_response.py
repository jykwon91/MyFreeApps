"""A recurring rent obligation as returned to the client."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class RentScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    applicant_id: uuid.UUID
    property_id: uuid.UUID | None = None
    amount: Decimal
    cadence: str
    start_date: _dt.date
    end_date: _dt.date | None = None
    grace_days: int | None = None
    notes: str | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime
