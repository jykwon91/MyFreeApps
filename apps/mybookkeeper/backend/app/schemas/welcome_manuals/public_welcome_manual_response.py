from pydantic import BaseModel, ConfigDict

from app.schemas.welcome_manuals.public_welcome_manual_place_response import (
    PublicWelcomeManualPlaceResponse,
)
from app.schemas.welcome_manuals.public_welcome_manual_section_response import (
    PublicWelcomeManualSectionResponse,
)


class PublicWelcomeManualResponse(BaseModel):
    """The guest-safe manual projection returned on a successful PIN unlock.

    DELIBERATELY minimal: ONLY ``title``, ``sections``, and ``places``. Must
    NEVER contain ``organization_id``, ``user_id``/``property_id``, any
    owner/user id or email, ``share_token``, ``share_pin``, or any audit
    field (``created_at``/``updated_at``/``deleted_at``) — this is the
    unauthenticated response body, readable by anyone who obtains the link.
    """

    title: str
    sections: list[PublicWelcomeManualSectionResponse] = []
    places: list[PublicWelcomeManualPlaceResponse] = []

    model_config = ConfigDict(from_attributes=True)
