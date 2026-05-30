import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WelcomeManualSectionResponse(BaseModel):
    """One section of a welcome manual. Section images are added to this shape
    in PR 2 (the ``images`` field)."""

    id: uuid.UUID
    manual_id: uuid.UUID
    title: str
    body: str | None = None
    display_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
