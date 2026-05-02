"""Calendar event payload — one row per listing_blackout joined to its
listing + property.

Returned as a flat list by ``GET /api/calendar/events`` (the unified
calendar viewer). The viewer is read-only — no mutations exist on this
schema.

Date semantics match ``ListingBlackout``: ``starts_on`` inclusive,
``ends_on`` exclusive (iCal RFC 5545 convention). The frontend grid is
responsible for translating exclusive end → display end.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class CalendarEventResponse(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    listing_name: str
    property_id: uuid.UUID
    property_name: str
    starts_on: date
    ends_on: date
    source: str
    source_event_id: str | None = None
    summary: str | None = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
