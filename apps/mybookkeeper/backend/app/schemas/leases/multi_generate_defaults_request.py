"""Request body for POST /lease-templates/generate-defaults (multi-template)."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class MultiGenerateDefaultsRequest(BaseModel):
    """Resolve defaults for the union of placeholders across N templates."""

    template_ids: list[uuid.UUID] = Field(min_length=1)
    applicant_id: uuid.UUID

    model_config = ConfigDict(extra="forbid")
