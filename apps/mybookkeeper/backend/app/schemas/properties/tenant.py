import uuid
from datetime import datetime

from pydantic import BaseModel


class TenantRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    property_id: uuid.UUID
    name: str
    email: str | None = None
    phone: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
