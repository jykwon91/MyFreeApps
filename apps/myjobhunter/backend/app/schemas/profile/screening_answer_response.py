"""ScreeningAnswerResponse — full read shape.

Note: ``is_eeoc`` is derived server-side from ``question_key``.
Frontend reads it back to render EEOC badges but never sends it.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ScreeningAnswerResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    profile_id: uuid.UUID
    question_key: str
    answer: str | None = None
    is_eeoc: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
