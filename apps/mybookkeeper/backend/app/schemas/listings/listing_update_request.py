"""Pydantic schema for PUT /listings/{id} request body.

All fields optional — only provided fields are updated. The repository layer
applies an explicit allowlist before `setattr` (see `update_listing` in
`repositories/listings/listing_repo.py`) per the project rule:
"Always validate field names against an explicit allowlist before applying
dynamic updates."
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.listing_enums import LISTING_ROOM_TYPES, LISTING_STATUSES

_AMENITY_MAX_LEN = 64
_AMENITIES_MAX_ITEMS = 50


class ListingUpdateRequest(BaseModel):
    """Body for PUT /listings/{id} — every field optional."""

    property_id: uuid.UUID | None = None

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None

    monthly_rate: Decimal | None = Field(default=None, gt=0)
    weekly_rate: Decimal | None = Field(default=None, ge=0)
    nightly_rate: Decimal | None = Field(default=None, ge=0)

    min_stay_days: int | None = Field(default=None, ge=0)
    max_stay_days: int | None = Field(default=None, ge=0)

    room_type: str | None = None
    private_bath: bool | None = None
    parking_assigned: bool | None = None
    furnished: bool | None = None

    status: str | None = None
    amenities: list[str] | None = Field(default=None, max_length=_AMENITIES_MAX_ITEMS)

    pets_on_premises: bool | None = None
    large_dog_disclosure: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "ListingUpdateRequest":
        if self.room_type is not None and self.room_type not in LISTING_ROOM_TYPES:
            raise ValueError(
                f"room_type must be one of {LISTING_ROOM_TYPES}, got {self.room_type!r}",
            )
        if self.status is not None and self.status not in LISTING_STATUSES:
            raise ValueError(
                f"status must be one of {LISTING_STATUSES}, got {self.status!r}",
            )
        if (
            self.min_stay_days is not None
            and self.max_stay_days is not None
            and self.min_stay_days > self.max_stay_days
        ):
            raise ValueError("min_stay_days cannot exceed max_stay_days")
        if self.amenities is not None:
            for amenity in self.amenities:
                if not amenity or len(amenity) > _AMENITY_MAX_LEN:
                    raise ValueError(
                        f"amenities must be non-empty strings up to {_AMENITY_MAX_LEN} chars",
                    )
        return self

    def to_update_dict(self) -> dict[str, object]:
        """Return only the explicitly-provided fields (Pydantic `exclude_unset`).

        Used by the service layer to pass to `listing_repo.update_listing` —
        the repo layer applies the allowlist filter.
        """
        return self.model_dump(exclude_unset=True)
