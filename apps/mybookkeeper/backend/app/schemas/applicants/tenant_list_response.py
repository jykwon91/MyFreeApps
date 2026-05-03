"""Paginated envelope for GET /applicants/tenants."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.applicants.applicant_summary import ApplicantSummary


class TenantListResponse(BaseModel):
    items: list[ApplicantSummary]
    total: int
    has_more: bool

    model_config = ConfigDict(from_attributes=True)
