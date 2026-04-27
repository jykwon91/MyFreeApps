"""Pydantic schema for an InquiryEvent (read-only — events are append-only)."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class InquiryEventResponse(BaseModel):
    id: uuid.UUID
    inquiry_id: uuid.UUID
    event_type: str
    actor: str
    notes: str | None = None
    occurred_at: _dt.datetime
    created_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
