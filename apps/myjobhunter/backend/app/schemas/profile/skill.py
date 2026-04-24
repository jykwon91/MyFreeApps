"""Skill schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class SkillRead(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    name: str
    years_experience: int | None
    category: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
