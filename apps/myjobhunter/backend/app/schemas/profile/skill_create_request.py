"""POST /skills request body."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

_CATEGORY_VALUES = frozenset({"language", "framework", "tool", "platform", "soft"})


class SkillCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    years_experience: int | None = Field(default=None, ge=0, lt=70)
    category: str | None = Field(default=None)

    model_config = ConfigDict(extra="forbid")

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str | None) -> str | None:
        if v is not None and v not in _CATEGORY_VALUES:
            raise ValueError(f"category must be one of {sorted(_CATEGORY_VALUES)}")
        return v
