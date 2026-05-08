"""Paginated envelope for GET /vendors — same shape as ApplicantListResponse."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.vendors.vendor_summary import VendorSummary


class VendorListResponse(ListResponse[VendorSummary]):
    pass
