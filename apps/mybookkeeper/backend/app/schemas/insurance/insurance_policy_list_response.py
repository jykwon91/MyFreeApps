"""Paginated list response for insurance policies."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary


class InsurancePolicyListResponse(ListResponse[InsurancePolicySummary]):
    pass
