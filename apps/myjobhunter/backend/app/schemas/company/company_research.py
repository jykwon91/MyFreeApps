"""CompanyResearch schemas — Phase 1 stub."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class CompanyResearchRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    overall_sentiment: str
    comp_confidence: str
    last_researched_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
