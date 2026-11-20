"""Paginated envelope for GET /customers -- same shape as every app's list response."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.customer.customer_schemas import CustomerListItem


class CustomerListResponse(ListResponse[CustomerListItem]):
    pass
