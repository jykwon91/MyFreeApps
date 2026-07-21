import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WelcomeManualSectionFieldResponse(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    label: str
    value: str | None = None
    display_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
