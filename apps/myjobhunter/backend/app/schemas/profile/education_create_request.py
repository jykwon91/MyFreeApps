"""POST /education request body."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class EducationCreateRequest(BaseModel):
    school: str = Field(min_length=1, max_length=200)
    degree: str | None = Field(default=None, max_length=100)
    field: str | None = Field(default=None, max_length=100)
    start_year: int | None = Field(default=None, ge=1950, le=2100)
    end_year: int | None = Field(default=None, ge=1950, le=2100)
    gpa: Decimal | None = Field(default=None, ge=0, le=9.99)

    model_config = ConfigDict(extra="forbid")
