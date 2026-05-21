"""Pydantic schema for PATCH /applications/{id}/events/{event_id} body.

Allowlists only the two user-input columns on ``ApplicationEvent``:
``interview_details`` and ``note``.  Every other column
(``event_type``, ``occurred_at``, ``source``, ``email_message_id``,
``raw_payload``) is structurally immutable — the audit invariant
"this event was logged at time X via source Y" stays trustworthy.

``extra='forbid'`` rejects any attempt to PATCH the immutable fields.

The service layer enforces the additional rule that PATCH is only
valid for ``interview_scheduled`` / ``interview_completed`` event
types — system-generated events (``applied`` from kanban transitions,
``email_received`` from Gmail sync) remain immutable.

Field-level validation for ``interview_details`` mirrors
``InterviewDetailsRequest`` exactly so the create and edit paths
accept the same shape.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.application.application_event_create_request import (
    InterviewDetailsRequest,
)

_NOTE_MAX_LEN = 5000


class ApplicationEventUpdateRequest(BaseModel):
    """Body for PATCH /applications/{application_id}/events/{event_id}.

    Both fields are optional — a caller updating only the note keeps
    ``interview_details`` unchanged on the row, and vice versa. Both
    fields are nullable: passing ``null`` clears the column.
    """

    interview_details: InterviewDetailsRequest | None = None
    note: str | None = Field(default=None, max_length=_NOTE_MAX_LEN)

    model_config = ConfigDict(extra="forbid")
