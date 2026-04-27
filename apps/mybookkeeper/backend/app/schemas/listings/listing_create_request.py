"""Pydantic schema for POST /listings request body.

Validation matches the SQLAlchemy `Listing` model (`models/listings/listing.py`)
and the canonical enum tuples in `core/listing_enums.py`. Authoritative business
rules (status transitions, allowlisted updates) live in the service / repository
layer; this schema enforces shape + per-field bounds.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.listing_enums import LISTING_ROOM_TYPES, LISTING_STATUSES

# Per RENTALS_PLAN.md §5.1 / §8.6: bound the JSONB amenities array so a
# malicious client can't expand it into a large blob.
_AMENITY_MAX_LEN = 64
_AMENITIES_MAX_ITEMS = 50


class ListingCreateRequest(BaseModel):
    """Body for POST /listings.

    `organization_id` and `user_id` are NOT accepted — they're resolved
    server-side from the request context. `id`, `deleted_at`, `created_at`,
    `updated_at` are server-managed.
    """

    property_id: uuid.UUID

    title: str = Field(min_length=1, max_length=200)
    description: str | None = None

    monthly_rate: Decimal = Field(gt=0)
    weekly_rate: Decimal | None = Field(default=None, ge=0)
    nightly_rate: Decimal | None = Field(default=None, ge=0)

    min_stay_days: int | None = Field(default=None, ge=0)
    max_stay_days: int | None = Field(default=None, ge=0)

    room_type: str
    private_bath: bool = False
    parking_assigned: bool = False
    furnished: bool = True

    status: str = "draft"
    amenities: list[str] = Field(default_factory=list, max_length=_AMENITIES_MAX_ITEMS)

    pets_on_premises: bool = False
    large_dog_disclosure: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "ListingCreateRequest":
        if self.room_type not in LISTING_ROOM_TYPES:
            raise ValueError(
                f"room_type must be one of {LISTING_ROOM_TYPES}, got {self.room_type!r}",
            )
        if self.status not in LISTING_STATUSES:
            raise ValueError(
                f"status must be one of {LISTING_STATUSES}, got {self.status!r}",
            )
        if (
            self.min_stay_days is not None
            and self.max_stay_days is not None
            and self.min_stay_days > self.max_stay_days
        ):
            raise ValueError("min_stay_days cannot exceed max_stay_days")
        for amenity in self.amenities:
            if not amenity or len(amenity) > _AMENITY_MAX_LEN:
                raise ValueError(
                    f"amenities must be non-empty strings up to {_AMENITY_MAX_LEN} chars",
                )
        return self
