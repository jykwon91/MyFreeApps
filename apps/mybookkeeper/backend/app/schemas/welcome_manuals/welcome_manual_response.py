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

    # Public share link — populated only when the host has enabled sharing.
    # ``share_pin`` is the DECRYPTED plaintext PIN (read via the
    # ``EncryptedString`` column) so the admin editor can display/copy it.
    # This is the AUTHENTICATED response — never exposed on the public routes.
    share_token: str | None = None
    share_pin: str | None = None

    sections: list[WelcomeManualSectionResponse] = []
    places: list[WelcomeManualPlaceResponse] = []

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
