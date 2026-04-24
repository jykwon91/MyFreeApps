"""Education schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class EducationRead(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    school: str
    degree: str | None
    field: str | None
    start_year: int | None
    end_year: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
