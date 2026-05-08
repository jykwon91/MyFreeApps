"""Paginated envelope for GET /listings.

Replaces the bare `list[ListingSummary]` response from PR 1.1b — without a
total + has_more flag the frontend's "Load more" button has no terminator
(known tech debt logged on PR 1.1b). This envelope mirrors the convention
used by other paginated routes and gives the client an authoritative end
signal.
"""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.listings.listing_summary import ListingSummary


class ListingListResponse(ListResponse[ListingSummary]):
    """Paginated response envelope for GET /listings."""
