"""Request body for POST /signed-leases/{lease_id}/templates."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_validator


class SignedLeaseAddTemplatesRequest(BaseModel):
    template_ids: list[uuid.UUID]
    # Caller-supplied placeholder values, applied on top of the lease's
    # existing values and any auto-resolved defaults. Required when
    # attaching a template to an imported lease whose ``lease.values`` is
    # empty by construction; optional when adding to a generated lease.
    values: dict[str, str] | None = Field(default=None)

    @field_validator("template_ids")
    @classmethod
    def require_non_empty(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if not v:
            raise ValueError("template_ids must contain at least one id")
        return v
