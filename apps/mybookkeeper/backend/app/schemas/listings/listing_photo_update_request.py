"""Pydantic schema for PATCH /listings/{listing_id}/photos/{photo_id}.

Allows reordering (`display_order`) and caption editing.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ListingPhotoUpdateRequest(BaseModel):
    caption: str | None = Field(default=None, max_length=500)
    display_order: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)
