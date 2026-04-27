import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class ListingSummary(BaseModel):
    """Minimal listing payload for list-style views (inbox, picker, dashboard)."""

    id: uuid.UUID
    title: str
    status: str
    room_type: str
    monthly_rate: Decimal
    property_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
