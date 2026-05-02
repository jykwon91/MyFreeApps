"""Pydantic schema for an ApplicationEvent response.

Used by GET /applications/{id}/events and POST /applications/{id}/events.
``raw_payload`` and ``email_message_id`` are exposed read-only — they
only get populated by Gmail sync workers, never by manual log entries.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ApplicationEventResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    application_id: uuid.UUID

    event_type: str
    occurred_at: _dt.datetime
    source: str
    email_message_id: str | None = None
    raw_payload: dict | None = None
    note: str | None = None

    created_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
