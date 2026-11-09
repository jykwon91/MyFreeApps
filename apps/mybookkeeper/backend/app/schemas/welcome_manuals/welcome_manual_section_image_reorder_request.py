"""Pydantic schema for PUT /welcome-manuals/{id}/sections/{sid}/images/order."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_SECTION_IMAGES


class WelcomeManualSectionImageReorderRequest(BaseModel):
    """Full permutation of a section's image ids, in the desired order.

    The service rejects a list that isn't exactly the section's current image
    set, so a stale client can't silently drop a photo from the ordering.
    """

    image_ids: list[uuid.UUID] = Field(min_length=1, max_length=WELCOME_MANUAL_MAX_SECTION_IMAGES)

    model_config = ConfigDict(extra="forbid")
