"""Pydantic schema for an ApplicationEvent response.

Used by GET /applications/{id}/events and POST /applications/{id}/events.
``email_message_id`` is exposed read-only — it is only populated by Gmail
sync workers, never by manual log entries.

``raw_payload`` was removed from this response schema (audit 2026-05-02,
CWE-200). The field is always null in Phase 1-2 and exposing it in the public
API response is a forward-looking data-exposure risk. If Phase 3 Gmail
sync workers need to surface parsed email artifacts, introduce a separate
admin-only response schema at that time.
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
    note: str | None = None

    created_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
