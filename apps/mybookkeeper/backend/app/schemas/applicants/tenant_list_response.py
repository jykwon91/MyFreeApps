"""Paginated envelope for GET /applicants/tenants."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.applicants.applicant_summary import ApplicantSummary


class TenantListResponse(ListResponse[ApplicantSummary]):
    pass
