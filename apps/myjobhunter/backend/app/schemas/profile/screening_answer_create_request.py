"""POST /screening-answers request body.

Callers MUST NOT send ``is_eeoc`` — it is derived server-side from
``question_key`` in ``app/core/screening_questions.py``.
``question_key`` must be drawn from ``ALLOWED_KEYS``; the service validates this.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

_ANSWER_MAX_LEN = 5000


class ScreeningAnswerCreateRequest(BaseModel):
    question_key: str = Field(min_length=1, max_length=80)
    answer: str | None = Field(default=None, max_length=_ANSWER_MAX_LEN)

    model_config = ConfigDict(extra="forbid")
