"""Pydantic schema for a Reference (applicant_references) response.

``reference_contact`` comes from ``POST /applicants/{id}/sensitive``, which
records who asked.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ReferenceResponse(BaseModel):
    id: uuid.UUID
    applicant_id: uuid.UUID
    relationship: str
    reference_name: str
    notes: str | None = None
    contacted_at: _dt.datetime | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
