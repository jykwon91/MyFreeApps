import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.welcome_manuals.welcome_manual_section_response import (
    WelcomeManualSectionResponse,
)


class WelcomeManualResponse(BaseModel):
    """Full welcome-manual payload for detail views — includes ordered sections."""

    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    property_id: uuid.UUID | None = None

    title: str
    intro_text: str | None = None

    sections: list[WelcomeManualSectionResponse] = []

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
