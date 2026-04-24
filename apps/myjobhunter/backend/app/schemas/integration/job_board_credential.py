"""JobBoardCredential schemas — Phase 1 stub. Credentials never returned in responses."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class JobBoardCredentialRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    board: str
    key_version: int
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
