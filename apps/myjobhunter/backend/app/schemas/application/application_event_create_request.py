"""Pydantic schema for POST /applications/{id}/events request body.

Mirrors the writable columns on ``ApplicationEvent``. ``user_id``,
``application_id``, ``email_message_id`` (Gmail-sync only),
``raw_payload`` (Gmail-sync only) are NOT accepted via the manual-log
route — they're set by the service layer from request context or by
background sync workers. ``extra='forbid'`` rejects attempts to inject
them.

``event_type`` and ``source`` are validated against the enum allowlists
in ``app.core.enums`` to match the DB CHECK constraints.

``interview_details`` is optional and accepted only when ``event_type``
is ``interview_scheduled`` or ``interview_completed``.  When present, the
``type`` sub-field is required and must be one of the ``InterviewType``
values.  All other sub-fields are optional so the operator can supply
only the information they know at the time of logging.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import EventType, EventSource, InterviewType

_EVENT_TYPE_MAX_LEN = 30
_SOURCE_MAX_LEN = 20
_NOTE_MAX_LEN = 5000
_LOCATION_MAX_LEN = 1024
_NAME_MAX_LEN = 200
_MAX_INTERVIEWERS = 20

# Event types for which interview_details is meaningful.
_INTERVIEW_EVENT_TYPES = frozenset({
    EventType.INTERVIEW_SCHEDULED,
    EventType.INTERVIEW_COMPLETED,
})


class InterviewDetailsRequest(BaseModel):
    """Structured interview metadata accepted in the manual-log request.

    ``type`` is the only required sub-field when this object is present.
    Everything else is best-effort: the operator might know only the date,
    or only the meeting link.
    """

    type: str = Field(min_length=1, max_length=20)
    scheduled_at: _dt.datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    location_or_link: str | None = Field(default=None, max_length=_LOCATION_MAX_LEN)
    interviewer_names: list[str] | None = Field(default=None, max_length=_MAX_INTERVIEWERS)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_type(self) -> "InterviewDetailsRequest":
        if self.type not in InterviewType.ALL:
            raise ValueError(
                f"interview_details.type must be one of {InterviewType.ALL}, "
                f"got {self.type!r}",
            )
        if self.interviewer_names is not None:
            for name in self.interviewer_names:
                if len(name) > _NAME_MAX_LEN:
                    raise ValueError(
                        f"Interviewer name exceeds {_NAME_MAX_LEN} characters: {name!r}",
                    )
        return self


class ApplicationEventCreateRequest(BaseModel):
    """Body for POST /applications/{application_id}/events."""

    event_type: str = Field(min_length=1, max_length=_EVENT_TYPE_MAX_LEN)
    occurred_at: _dt.datetime
    source: str = Field(default=EventSource.MANUAL, max_length=_SOURCE_MAX_LEN)
    note: str | None = Field(default=None, max_length=_NOTE_MAX_LEN)
    interview_details: InterviewDetailsRequest | None = None

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
        if self.interview_details is not None and self.event_type not in _INTERVIEW_EVENT_TYPES:
            raise ValueError(
                f"interview_details is only valid for event_type in "
                f"{sorted(_INTERVIEW_EVENT_TYPES)}, got {self.event_type!r}",
            )
        return self
