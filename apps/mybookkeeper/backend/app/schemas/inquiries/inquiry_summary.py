"""Minimal Inquiry payload for inbox-style views.

Built from the ``list_with_last_message`` repo function — joins the most
recent ``inquiry_messages`` row per inquiry without an N+1 round trip.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class InquirySummary(BaseModel):
    """Inbox-card shape per RENTALS_PLAN.md §9.1.

    Fields included:
        - id, source, listing_id, stage (for filtering / navigation)
        - inquirer_name (display)
        - desired_start_date / desired_end_date (date range)
        - inquirer_employer (host's primary signal for triage)
        - received_at + last_message_at (sort + freshness)
        - last_message_preview (first 120 chars of last parsed_body)
        - gut_rating (display only after host has set it)

    Excluded per §9.1 information hierarchy:
        - notes (detail-only)
        - all PII besides display name + employer (privacy)
    """

    id: uuid.UUID
    source: str
    listing_id: uuid.UUID | None = None
    stage: str

    inquirer_name: str | None = None
    inquirer_employer: str | None = None

    desired_start_date: _dt.date | None = None
    desired_end_date: _dt.date | None = None

    gut_rating: int | None = None
    received_at: _dt.datetime

    last_message_preview: str | None = None
    last_message_at: _dt.datetime | None = None

    model_config = ConfigDict(from_attributes=True)
