"""Pydantic schema for POST /applications/{id}/events request body.

Mirrors the writable columns on ``ApplicationEvent``. ``user_id``,
``application_id``, ``email_message_id`` (Gmail-sync only),
``raw_payload`` (Gmail-sync only) are NOT accepted via the manual-log
route — they're set by the service layer from request context or by
background sync workers. ``extra='forbid'`` rejects attempts to inject
them.

``event_type`` and ``source`` are validated against the enum allowlists
in ``app.core.enums`` to match the DB CHECK constraints.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import EventType, EventSource

_EVENT_TYPE_MAX_LEN = 30
_SOURCE_MAX_LEN = 20
_NOTE_MAX_LEN = 5000


class ApplicationEventCreateRequest(BaseModel):
    """Body for POST /applications/{application_id}/events."""

    event_type: str = Field(min_length=1, max_length=_EVENT_TYPE_MAX_LEN)
    occurred_at: _dt.datetime
    source: str = Field(default=EventSource.MANUAL, max_length=_SOURCE_MAX_LEN)
    note: str | None = Field(default=None, max_length=_NOTE_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_enums(self) -> "ApplicationEventCreateRequest":
        if self.event_type not in EventType.ALL:
            raise ValueError(
                f"event_type must be one of {EventType.ALL}, got {self.event_type!r}",
            )
        if self.source not in EventSource.ALL:
            raise ValueError(
                f"source must be one of {EventSource.ALL}, got {self.source!r}",
            )
        return self
