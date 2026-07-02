"""POST /work-history request body."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

_BULLET_MAX_LEN = 2000
_BULLETS_MAX_COUNT = 30

# Annotated item type so each bullet is length-capped.
BulletItem = Annotated[str, Field(min_length=1, max_length=_BULLET_MAX_LEN)]


class WorkHistoryCreateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date | None = None
    is_current: bool = False
    bullets: list[BulletItem] = Field(default_factory=list, max_length=_BULLETS_MAX_COUNT)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _current_role_has_no_end_date(self) -> "WorkHistoryCreateRequest":
        if self.is_current and self.end_date is not None:
            raise ValueError("A current role cannot have an end date.")
        return self
