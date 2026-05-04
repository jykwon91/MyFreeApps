"""Response schema for POST /calendar/review-queue/{id}/resolve.

Returns both the resolved queue row and the newly created listing_blackout,
so the frontend can navigate to the calendar with the correct date window.

``extra="forbid"`` on sub-schemas is not needed here (these are responses,
not inputs) but ``from_attributes=True`` is required so Pydantic can build
these from ORM instances.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class BlackoutSummary(BaseModel):
    """Minimal blackout fields the frontend needs to navigate the calendar."""
    id: uuid.UUID
    listing_id: uuid.UUID
    starts_on: date
    ends_on: date
    source: str

    model_config = ConfigDict(from_attributes=True)


class ResolveQueueItemResponse(BaseModel):
    """Combined response for the resolve action.

    ``queue_item_id``  — the now-resolved queue row (for optimistic UI removal).
    ``blackout``       — the inserted (or pre-existing idempotent) blackout row.
    """
    queue_item_id: uuid.UUID
    blackout: BlackoutSummary

    model_config = ConfigDict(from_attributes=True)
