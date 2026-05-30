import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WelcomeManualSummary(BaseModel):
    """Minimal manual payload for the list view.

    ``section_count`` is not a column — the service populates it from a single
    grouped count query, so this model is constructed explicitly rather than
    via ``model_validate``.
    """

    id: uuid.UUID
    title: str
    property_id: uuid.UUID | None = None
    section_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
