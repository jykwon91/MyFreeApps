"""POST /work-history request body."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class WorkHistoryCreateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date | None = None
    bullets: list[str] = Field(default_factory=list, max_length=30)

    model_config = ConfigDict(extra="forbid")
