"""Response schema for a single listing blackout (returned by PATCH)."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class BlackoutResponse(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    starts_on: date
    ends_on: date
    source: str
    source_event_id: str | None = None
    host_notes: str | None = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
