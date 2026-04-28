"""Paginated envelope for GET /applicants — same shape as InquiryListResponse."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.applicants.applicant_summary import ApplicantSummary


class ApplicantListResponse(BaseModel):
    items: list[ApplicantSummary]
    total: int
    has_more: bool

    model_config = ConfigDict(from_attributes=True)
