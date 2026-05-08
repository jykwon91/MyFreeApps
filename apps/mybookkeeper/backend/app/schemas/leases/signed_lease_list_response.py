"""Paginated envelope for GET /signed-leases."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.leases.signed_lease_summary import SignedLeaseSummary


class SignedLeaseListResponse(ListResponse[SignedLeaseSummary]):
    pass
