from pydantic import BaseModel, ConfigDict

from app.schemas.welcome_manuals.public_welcome_manual_section_field_response import (
    PublicWelcomeManualSectionFieldResponse,
)
from app.schemas.welcome_manuals.public_welcome_manual_section_image_response import (
    PublicWelcomeManualSectionImageResponse,
)


class PublicWelcomeManualSectionResponse(BaseModel):
    """Guest-safe section projection — title, body, and its ordered fields /
    images only. No ``id``, ``manual_id``, or ``display_order``; list order
    already reflects display order."""

    title: str
    body: str | None = None
    fields: list[PublicWelcomeManualSectionFieldResponse] = []
    images: list[PublicWelcomeManualSectionImageResponse] = []

    model_config = ConfigDict(from_attributes=True)
