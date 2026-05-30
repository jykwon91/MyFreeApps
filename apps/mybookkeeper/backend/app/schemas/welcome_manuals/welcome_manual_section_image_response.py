import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WelcomeManualSectionImageResponse(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    storage_key: str
    caption: str | None = None
    display_order: int
    created_at: datetime
    # Short-lived signed URL minted per request via the single presigned seam.
    presigned_url: str | None = None
    # ``False`` means the underlying MinIO object is missing — the UI renders a
    # placeholder + "re-upload" affordance instead of a broken image.
    is_available: bool = True

    model_config = ConfigDict(from_attributes=True)
