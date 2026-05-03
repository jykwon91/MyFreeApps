"""Request body for PATCH /applicants/{id}/tenancy/end."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TenancyEndRequest(BaseModel):
    reason: str | None = Field(
        None,
        max_length=500,
        description="Optional reason for ending the tenancy.",
    )

    model_config = ConfigDict(extra="forbid")
