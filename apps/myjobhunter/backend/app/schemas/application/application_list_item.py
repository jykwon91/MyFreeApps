"""Pydantic schema for a single row in ``GET /applications`` response.

Extends the full ``ApplicationResponse`` with two list-only fields:

- ``latest_status`` — the ``event_type`` of the most-recent
  ``application_events`` row, computed via a correlated sub-select
  (lateral join idiom). ``None`` when the application has no events yet.
- ``company_name`` — the display name from the joined ``companies`` row,
  so the frontend table can render a Company column without a second
  round-trip per row.

Kept as a separate schema from ``ApplicationResponse`` so the detail
endpoint (``GET /applications/{id}``) is not affected — it has no need to
join against the event log or denormalize the company name.
"""
from __future__ import annotations

from app.schemas.application.application_response import ApplicationResponse


class ApplicationListItem(ApplicationResponse):
    """ApplicationResponse extended with computed list-only fields."""

    latest_status: str | None = None
    company_name: str | None = None
