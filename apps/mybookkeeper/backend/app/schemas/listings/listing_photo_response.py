import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ListingPhotoResponse(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    storage_key: str
    caption: str | None = None
    display_order: int
    created_at: datetime
    presigned_url: str | None = None
    # ``False`` means the underlying MinIO object is missing. UI surfaces
    # a placeholder + warning instead of a broken image tag.
    is_available: bool = True

    model_config = ConfigDict(from_attributes=True)
