"""Response schemas for the Analyze-a-job endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class JobAnalysisExtracted(BaseModel):
    """The structured JD facts the analysis pass returned alongside its
    verdict. Mirrors a subset of ``ExtractedJD`` plus posted-salary
    fields that the existing JD parsing prompt also surfaces."""

    title: str | None = None
    company: str | None = None
    location: str | None = None
    remote_type: str | None = None
    posted_salary_min: float | None = None
    posted_salary_max: float | None = None
    posted_salary_currency: str | None = None
    posted_salary_period: str | None = None
    summary: str | None = None


class JobAnalysisDimension(BaseModel):
    """One row of the per-dimension verdict grid."""

    key: str
    status: str
    rationale: str


class JobAnalysisResponse(BaseModel):
    """Full response body for ``POST /jobs/analyze`` and the GET endpoint.

    Mirrors :class:`JobAnalysis` ORM model plus the URL the operator
    pasted (echoed for the frontend's source-link affordance).
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    source_url: str | None
    jd_text: str
    fingerprint: str

    extracted: JobAnalysisExtracted
    verdict: str
    verdict_summary: str
    dimensions: list[JobAnalysisDimension]
    red_flags: list[str]
    green_flags: list[str]

    total_tokens_in: int
    total_tokens_out: int
    # Numeric(10, 6) deserializes as Decimal in SQLAlchemy; serialize as
    # a JSON number with float-precision for the frontend.
    total_cost_usd: Decimal

    applied_application_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
