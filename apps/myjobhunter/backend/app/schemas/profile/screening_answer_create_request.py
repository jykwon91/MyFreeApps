"""POST /screening-answers request body.

Callers MUST NOT send ``is_eeoc`` — it is derived server-side from
``question_key`` in ``app/core/screening_questions.py``.
``question_key`` must be drawn from ``ALLOWED_KEYS``; the service validates this.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ScreeningAnswerCreateRequest(BaseModel):
    question_key: str = Field(min_length=1, max_length=80)
    answer: str | None = None

    model_config = ConfigDict(extra="forbid")
