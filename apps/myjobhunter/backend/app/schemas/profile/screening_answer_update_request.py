"""PATCH /screening-answers/{id} request body.

Only ``answer`` is patchable. ``question_key`` and ``is_eeoc`` are immutable
after creation.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

_ANSWER_MAX_LEN = 5000


class ScreeningAnswerUpdateRequest(BaseModel):
    answer: str | None = Field(default=None, max_length=_ANSWER_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)
