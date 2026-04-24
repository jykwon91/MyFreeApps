"""ApplicationContact schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ApplicationContactRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    name: str | None
    email: str | None
    role: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
