"""EducationResponse — full read shape."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class EducationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    profile_id: uuid.UUID
    school: str
    degree: str | None = None
    field: str | None = None
    start_year: int | None = None
    end_year: int | None = None
    gpa: Decimal | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
