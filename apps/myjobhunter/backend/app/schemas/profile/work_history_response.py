"""WorkHistoryResponse — full read shape including user_id and bullets."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class WorkHistoryResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    profile_id: uuid.UUID
    company_name: str
    title: str
    start_date: date
    end_date: date | None = None
    bullets: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
