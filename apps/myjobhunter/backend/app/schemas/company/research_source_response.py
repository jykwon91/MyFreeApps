"""Response schema for a single ResearchSource.

Returned as part of the CompanyResearchResponse.sources list.
Mirrors the research_sources ORM model — immutable once created.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ResearchSourceResponse(BaseModel):
    id: uuid.UUID
    company_research_id: uuid.UUID
    url: str
    title: str | None
    snippet: str | None
    source_type: str
    fetched_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
