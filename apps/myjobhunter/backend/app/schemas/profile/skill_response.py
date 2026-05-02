"""SkillResponse — full read shape."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SkillResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    profile_id: uuid.UUID
    name: str
    years_experience: int | None = None
    category: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
