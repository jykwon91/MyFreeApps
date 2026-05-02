"""PATCH /screening-answers/{id} request body.

Only ``answer`` is patchable. ``question_key`` and ``is_eeoc`` are immutable
after creation.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ScreeningAnswerUpdateRequest(BaseModel):
    answer: str | None = None

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)
