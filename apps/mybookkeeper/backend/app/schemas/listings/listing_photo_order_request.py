"""Pydantic schema for PUT /listings/{listing_id}/photos/order."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.listing_constants import LISTING_PHOTO_ORDER_MAX_IDS


class ListingPhotoOrderRequest(BaseModel):
    """The listing's photos, first (the cover) to last."""

    photo_ids: list[uuid.UUID] = Field(min_length=1, max_length=LISTING_PHOTO_ORDER_MAX_IDS)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _no_repeats(self) -> ListingPhotoOrderRequest:
        if len(set(self.photo_ids)) != len(self.photo_ids):
            raise ValueError("photo_ids must not repeat")
        return self
