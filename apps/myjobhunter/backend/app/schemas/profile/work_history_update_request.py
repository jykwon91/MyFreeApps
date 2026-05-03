"""PATCH /work-history/{id} request body — all fields optional."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

_BULLET_MAX_LEN = 2000
_BULLETS_MAX_COUNT = 30

# Annotated item type so each bullet is length-capped.
BulletItem = Annotated[str, Field(min_length=1, max_length=_BULLET_MAX_LEN)]


class WorkHistoryUpdateRequest(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    bullets: list[BulletItem] | None = Field(default=None, max_length=_BULLETS_MAX_COUNT)

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)
