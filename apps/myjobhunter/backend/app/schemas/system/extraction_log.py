"""ExtractionLog schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ExtractionLogRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    context_type: str
    model: str
    status: str
    cost_usd: float | None
    created_at: datetime

    model_config = {"from_attributes": True}
