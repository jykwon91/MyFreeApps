"""Pydantic schema for an ApplicationContact response.

Used by POST /applications/{id}/contacts and embedded in
``ApplicationDetailResponse`` (GET /applications/{id}).

``linkedin_url`` and ``notes`` are included for completeness; the UI can
choose to render them selectively. ``user_id`` is exposed so callers can
verify ownership without a round-trip.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ApplicationContactResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    application_id: uuid.UUID

    name: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    role: str | None = None
    notes: str | None = None

    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
