"""One story edit in a triage plan; ``set`` is checked with the API's own schema."""
from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.wow.feature_requests.triage_story_patch import TriageStoryPatch


class PlanPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    story_id: uuid.UUID
    set: dict[str, Any] = Field(min_length=1)

    @field_validator("set")
    @classmethod
    def _valid_patch(cls, value: dict[str, Any]) -> dict[str, Any]:
        TriageStoryPatch.model_validate(value)
        return value
