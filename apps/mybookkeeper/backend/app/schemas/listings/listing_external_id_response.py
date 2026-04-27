import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ListingExternalIdResponse(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    source: str
    external_id: str | None = None
    external_url: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
