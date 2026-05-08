"""Paginated envelope for GET /applicants — same shape as InquiryListResponse."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.applicants.applicant_summary import ApplicantSummary


class ApplicantListResponse(ListResponse[ApplicantSummary]):
    pass
