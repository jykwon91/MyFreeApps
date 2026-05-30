"""Pydantic schema for PUT /welcome-manuals/{id}/sections/order request body."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class WelcomeManualSectionReorderRequest(BaseModel):
    """Full reorder — ``section_ids`` must be a permutation of the manual's
    current section ids. The service rejects partial / unknown id sets so the
    resulting display order is always unambiguous."""

    section_ids: list[uuid.UUID] = Field(min_length=1)

    model_config = ConfigDict(extra="forbid")
