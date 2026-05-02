"""PATCH /education/{id} request body — all fields optional."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class EducationUpdateRequest(BaseModel):
    school: str | None = Field(default=None, min_length=1, max_length=200)
    degree: str | None = Field(default=None, max_length=100)
    field: str | None = Field(default=None, max_length=100)
    start_year: int | None = Field(default=None, ge=1950, le=2100)
    end_year: int | None = Field(default=None, ge=1950, le=2100)
    gpa: Decimal | None = Field(default=None, ge=0, le=9.99)

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)
