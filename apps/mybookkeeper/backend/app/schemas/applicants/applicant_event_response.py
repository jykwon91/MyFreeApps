"""Pydantic schema for an ApplicantEvent response (read-only — append-only)."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ApplicantEventResponse(BaseModel):
    id: uuid.UUID
    applicant_id: uuid.UUID
    event_type: str
    actor: str
    notes: str | None = None
    occurred_at: _dt.datetime
    created_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
