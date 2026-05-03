"""Schema for POST /signed-leases — create a draft from a template."""
from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SignedLeaseCreateRequest(BaseModel):
    template_id: uuid.UUID
    applicant_id: uuid.UUID
    listing_id: uuid.UUID | None = None
    values: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")
