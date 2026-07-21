import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WelcomeManualPlaceResponse(BaseModel):
    id: uuid.UUID
    manual_id: uuid.UUID
    name: str
    cuisine: str
    price_tier: str | None = None
    note: str | None = None
    map_url: str | None = None
    display_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
