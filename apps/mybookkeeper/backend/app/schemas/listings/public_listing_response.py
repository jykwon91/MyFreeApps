"""Pydantic schema for ``GET /api/listings/public/<slug>`` (T0).

Public-facing listing payload — strictly the fields needed to render the
inquiry form's header. No PII, no operator-side data, no internal IDs that
could be enumerated to leak the org's portfolio.
"""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class PublicListingResponse(BaseModel):
    """Strict subset of Listing data the public inquiry form needs."""

    slug: str
    title: str
    description: str | None = None
    monthly_rate: Decimal
    room_type: str
    private_bath: bool
    parking_assigned: bool
    furnished: bool
    pets_on_premises: bool

    model_config = ConfigDict(from_attributes=True)
