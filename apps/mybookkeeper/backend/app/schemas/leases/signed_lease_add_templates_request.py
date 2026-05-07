"""Request body for POST /signed-leases/{lease_id}/templates."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, field_validator


class SignedLeaseAddTemplatesRequest(BaseModel):
    template_ids: list[uuid.UUID]

    @field_validator("template_ids")
    @classmethod
    def require_non_empty(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if not v:
            raise ValueError("template_ids must contain at least one id")
        return v
