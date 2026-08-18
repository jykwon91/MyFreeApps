"""Paginated list response for mortgages."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.mortgage.mortgage_response import MortgageResponse


class MortgageListResponse(ListResponse[MortgageResponse]):
    pass
