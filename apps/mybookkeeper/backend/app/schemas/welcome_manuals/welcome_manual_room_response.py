import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WelcomeManualRoomResponse(BaseModel):
    """One room within a by-the-room welcome manual.

    Rooms don't carry content themselves — sections point at them. A section
    with ``room_id = None`` is shared by every room; one carrying this room's
    id appears only in this room's guide.
    """

    id: uuid.UUID
    manual_id: uuid.UUID
    name: str
    display_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
