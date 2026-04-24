"""ScreeningAnswer schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ScreeningAnswerRead(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    question_key: str
    answer: str | None
    is_eeoc: bool
    created_at: datetime

    model_config = {"from_attributes": True}
