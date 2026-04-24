"""ResearchSource schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class ResearchSourceRead(BaseModel):
    id: uuid.UUID
    company_research_id: uuid.UUID
    url: str
    source_type: str
    fetched_at: datetime

    model_config = {"from_attributes": True}
