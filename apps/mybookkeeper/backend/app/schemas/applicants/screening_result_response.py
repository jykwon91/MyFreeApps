"""Pydantic schema for a ScreeningResult response."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ScreeningResultResponse(BaseModel):
    id: uuid.UUID
    applicant_id: uuid.UUID
    provider: str
    status: str
    report_storage_key: str | None = None
    adverse_action_snippet: str | None = None
    notes: str | None = None
    requested_at: _dt.datetime
    completed_at: _dt.datetime | None = None
    created_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
