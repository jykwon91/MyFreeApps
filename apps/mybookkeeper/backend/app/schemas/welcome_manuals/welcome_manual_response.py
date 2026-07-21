import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.welcome_manuals.welcome_manual_place_response import (
    WelcomeManualPlaceResponse,
)
from app.schemas.welcome_manuals.welcome_manual_section_response import (
    WelcomeManualSectionResponse,
)


class WelcomeManualResponse(BaseModel):
    """Full welcome-manual payload for detail views — includes ordered sections
    and the flat restaurant-places directory."""

    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    property_id: uuid.UUID | None = None

    title: str
    intro_text: str | None = None

    sections: list[WelcomeManualSectionResponse] = []
    places: list[WelcomeManualPlaceResponse] = []

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
