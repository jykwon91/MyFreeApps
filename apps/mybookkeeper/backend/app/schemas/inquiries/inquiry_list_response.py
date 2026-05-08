"""Paginated envelope for GET /inquiries — same shape as ListingListResponse."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.inquiries.inquiry_summary import InquirySummary


class InquiryListResponse(ListResponse[InquirySummary]):
    pass
