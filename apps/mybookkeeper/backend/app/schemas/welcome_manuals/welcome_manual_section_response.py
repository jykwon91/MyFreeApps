import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)


class WelcomeManualSectionResponse(BaseModel):
    """One section of a welcome manual, with its ordered images.

    ``images`` is populated (with presigned URLs) on the full-manual read
    paths. Section-mutation responses (add / update / reorder) return an empty
    list — the frontend refetches the manual after those edits.
    """

    id: uuid.UUID
    manual_id: uuid.UUID
    title: str
    body: str | None = None
    display_order: int
    images: list[WelcomeManualSectionImageResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
