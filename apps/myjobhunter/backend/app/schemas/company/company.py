"""Company schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class CompanyRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    primary_domain: str | None
    industry: str | None
    size_range: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
