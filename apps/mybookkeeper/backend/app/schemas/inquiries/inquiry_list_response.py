"""Paginated envelope for GET /inquiries — same shape as ListingListResponse."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.inquiries.inquiry_summary import InquirySummary


class InquiryListResponse(BaseModel):
    items: list[InquirySummary]
    total: int
    has_more: bool

    model_config = ConfigDict(from_attributes=True)
