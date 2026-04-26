import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AuthEventRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    event_type: str
    ip_address: str | None = None
    user_agent: str | None = None
    metadata: dict = Field(alias="event_metadata")
    succeeded: bool
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}
