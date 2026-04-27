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

    model_config = ConfigDict(from_attributes=True)
