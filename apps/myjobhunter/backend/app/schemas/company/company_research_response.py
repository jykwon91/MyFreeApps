"""Response schema for a CompanyResearch record + its sources.

Returned by:
  GET  /companies/{company_id}/research
  POST /companies/{company_id}/research

Includes the AI-synthesised research fields and the backing source list.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.company.research_source_response import ResearchSourceResponse


class CompanyResearchResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    user_id: uuid.UUID

    # AI-synthesised fields
    overall_sentiment: str
    senior_engineer_sentiment: str | None
    interview_process: str | None
    description: str | None
    products_for_you: str | None
    red_flags: list[str]
    green_flags: list[str]
    reported_comp_range_min: float | None
    reported_comp_range_max: float | None
    comp_currency: str
    comp_confidence: str

    # Raw Claude output preserved for debugging / re-processing
    raw_synthesis: dict | None

    last_researched_at: datetime | None
    created_at: datetime
    updated_at: datetime

    # Sources that backed this research run
    sources: list[ResearchSourceResponse] = []

    model_config = ConfigDict(from_attributes=True)
