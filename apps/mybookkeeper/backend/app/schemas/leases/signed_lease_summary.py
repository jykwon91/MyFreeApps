"""Minimal signed-lease payload for list views."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class SignedLeaseSummary(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organization_id: uuid.UUID
    template_id: uuid.UUID | None = None
    applicant_id: uuid.UUID
    listing_id: uuid.UUID | None = None
    kind: str
    status: str
    starts_on: _dt.date | None = None
    ends_on: _dt.date | None = None
    generated_at: _dt.datetime | None = None
    signed_at: _dt.datetime | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
