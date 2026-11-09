"""Pydantic schema for PUT /welcome-manuals/{id}/sections/{sid}/fields/order."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_FIELDS


class WelcomeManualSectionFieldReorderRequest(BaseModel):
    """Full permutation of a section's field ids, in the desired order.

    The service rejects a list that isn't exactly the section's current field
    set, so a stale client can't silently drop a field from the ordering.
    """

    field_ids: list[uuid.UUID] = Field(min_length=1, max_length=WELCOME_MANUAL_MAX_FIELDS)

    model_config = ConfigDict(extra="forbid")
