"""Pydantic schema for PATCH /applicants/{id}/stage."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class StageTransitionRequest(BaseModel):
    new_stage: str = Field(..., description="Target stage from APPLICANT_STAGES")
    note: str | None = Field(
        None,
        max_length=500,
        description="Optional free-text note for the transition record",
    )

    model_config = ConfigDict(extra="forbid")
