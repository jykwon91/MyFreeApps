import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DeviceSessionRead(BaseModel):
    """One signed-in device. Secrets stay out of this on purpose."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_name: str | None
    created_at: datetime
    last_used_at: datetime
