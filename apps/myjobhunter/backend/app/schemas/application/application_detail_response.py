"""Pydantic schema for the enriched Application detail response.

Used by ``GET /applications/{id}`` — extends ``ApplicationResponse`` with
the full events timeline (newest-first) and the list of contacts.

Kept separate from ``ApplicationResponse`` to avoid loading these
collections for list endpoints (``GET /applications``) and write
endpoints (POST/PATCH) where they are unnecessary.

The events are newest first in the same order the board and list use to
pick the current stage (``occurred_at``, then ``created_at``, then ``id``,
all descending), applied by the event repository. Callers can rely on the
first stage-defining event being the application's current stage without
re-sorting client-side.
"""
from __future__ import annotations

from app.schemas.application.application_contact_response import ApplicationContactResponse
from app.schemas.application.application_event_response import ApplicationEventResponse
from app.schemas.application.application_response import ApplicationResponse


class ApplicationDetailResponse(ApplicationResponse):
    """ApplicationResponse enriched with timeline events and contacts."""

    events: list[ApplicationEventResponse] = []
    contacts: list[ApplicationContactResponse] = []
