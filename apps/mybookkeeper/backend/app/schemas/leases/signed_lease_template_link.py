"""Schema for a single template link on a signed-lease detail / summary.

Exposes the resolved template name (and version) alongside the id so the
frontend doesn't need a second fetch to render the list of contributing
templates.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class SignedLeaseTemplateLink(BaseModel):
    id: uuid.UUID
    name: str
    version: int
    display_order: int

    model_config = ConfigDict(from_attributes=False)
