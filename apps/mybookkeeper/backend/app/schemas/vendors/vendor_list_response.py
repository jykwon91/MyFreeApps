"""Paginated envelope for GET /vendors — same shape as ApplicantListResponse."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.vendors.vendor_summary import VendorSummary


class VendorListResponse(BaseModel):
    items: list[VendorSummary]
    total: int
    has_more: bool

    model_config = ConfigDict(from_attributes=True)
