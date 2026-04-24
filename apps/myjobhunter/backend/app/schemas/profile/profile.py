"""Profile schemas — Phase 1 stubs. Full CRUD schemas added in Phase 2."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ProfileRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    work_auth_status: str
    remote_preference: str
    salary_period: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
