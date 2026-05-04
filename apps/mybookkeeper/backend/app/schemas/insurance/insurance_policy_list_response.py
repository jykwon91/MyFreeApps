"""Paginated list response for insurance policies."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary


class InsurancePolicyListResponse(BaseModel):
    items: list[InsurancePolicySummary]
    total: int
    has_more: bool

    model_config = ConfigDict(from_attributes=True)
