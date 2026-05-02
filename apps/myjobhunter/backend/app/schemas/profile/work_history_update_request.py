"""PATCH /work-history/{id} request body — all fields optional."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class WorkHistoryUpdateRequest(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    bullets: list[str] | None = Field(default=None, max_length=30)

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)
