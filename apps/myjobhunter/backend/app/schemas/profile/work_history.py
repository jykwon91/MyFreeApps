"""WorkHistory schemas — Phase 1 stub."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel


class WorkHistoryRead(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    company_name: str
    title: str
    start_date: date
    end_date: date | None
    created_at: datetime

    model_config = {"from_attributes": True}
