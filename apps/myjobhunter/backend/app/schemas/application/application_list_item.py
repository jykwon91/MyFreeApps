"""Pydantic schema for a single row in ``GET /applications`` response.

Extends the full ``ApplicationResponse`` with ``latest_status`` — the
``event_type`` of the most-recent ``application_events`` row, computed by
the repository via a correlated sub-select (lateral join idiom).  ``None``
when the application has no events yet.

Kept as a separate schema from ``ApplicationResponse`` so the detail
endpoint (``GET /applications/{id}``) is not affected — it has no need to
join against the event log.
"""
from __future__ import annotations

from app.schemas.application.application_response import ApplicationResponse


class ApplicationListItem(ApplicationResponse):
    """ApplicationResponse extended with the computed status field."""

    latest_status: str | None = None
