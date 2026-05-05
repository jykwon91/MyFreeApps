"""Read schema for the admin auth-events listing route.

Mirrors apps/mybookkeeper/backend/app/schemas/system/auth_event.py exactly.
The ``event_metadata`` alias maps to the model's ``event_metadata`` field
(which itself maps to the SQL column ``metadata`` per the shared
``platform_shared.db.models.auth_event.AuthEvent``).
"""
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
