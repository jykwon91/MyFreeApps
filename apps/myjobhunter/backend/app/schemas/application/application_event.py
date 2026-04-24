"""ApplicationEvent schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ApplicationEventRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    event_type: str
    occurred_at: datetime
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}
