"""Application schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ApplicationRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    company_id: uuid.UUID
    role_title: str
    source: str | None
    remote_type: str
    archived: bool
    applied_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
