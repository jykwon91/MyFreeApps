"""PATCH /work-history/{id} request body — all fields optional."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

_BULLET_MAX_LEN = 2000
_BULLETS_MAX_COUNT = 30

# Annotated item type so each bullet is length-capped.
BulletItem = Annotated[str, Field(min_length=1, max_length=_BULLET_MAX_LEN)]

# Fields where None means "unset" in a partial update but the DB column is
# NOT NULL — an explicit JSON null must be rejected (422), not forwarded to
# the repository where it would blow up as an IntegrityError (500).
_NON_NULLABLE_FIELDS = ("company_name", "title", "start_date", "is_current", "bullets")


class WorkHistoryUpdateRequest(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    # ``is_current`` + ``end_date`` must not both be set on the merged row;
    # the service validates against the existing entry (partial updates make
    # a schema-level check impossible here).
    is_current: bool | None = None
    bullets: list[BulletItem] | None = Field(default=None, max_length=_BULLETS_MAX_COUNT)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _reject_explicit_null_on_non_nullable(self) -> "WorkHistoryUpdateRequest":
        for field in _NON_NULLABLE_FIELDS:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self

    def to_update_dict(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)
