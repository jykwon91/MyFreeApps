"""Paginated envelope for GET /signed-leases."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.leases.signed_lease_summary import SignedLeaseSummary


class SignedLeaseListResponse(BaseModel):
    items: list[SignedLeaseSummary]
    total: int
    has_more: bool

    model_config = ConfigDict(from_attributes=True)
