"""Pydantic schema for a ScreeningResult response.

The report and the adverse action reason come from
``POST /applicants/{id}/sensitive``, which records who asked.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ScreeningResultResponse(BaseModel):
    id: uuid.UUID
    applicant_id: uuid.UUID
    provider: str
    status: str
    has_report: bool = False
    notes: str | None = None
    requested_at: _dt.datetime
    completed_at: _dt.datetime | None = None
    uploaded_at: _dt.datetime
    uploaded_by_user_id: uuid.UUID
    created_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
