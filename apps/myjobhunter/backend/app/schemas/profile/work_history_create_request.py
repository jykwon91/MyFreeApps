"""POST /work-history request body."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

_BULLET_MAX_LEN = 2000
_BULLETS_MAX_COUNT = 30

# Annotated item type so each bullet is length-capped.
BulletItem = Annotated[str, Field(min_length=1, max_length=_BULLET_MAX_LEN)]


class WorkHistoryCreateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date | None = None
    bullets: list[BulletItem] = Field(default_factory=list, max_length=_BULLETS_MAX_COUNT)

    model_config = ConfigDict(extra="forbid")
