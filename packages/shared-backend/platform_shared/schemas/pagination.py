"""Generic paginated list response shared across all apps."""
from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

ItemT = TypeVar("ItemT")


class ListResponse(BaseModel, Generic[ItemT]):
    """Generic paginated list response.

    Use as ``class FooListResponse(ListResponse[FooResponse]): pass`` so the
    OpenAPI schema name stays stable for SPA consumers.
    """

    model_config = ConfigDict(from_attributes=True)

    items: list[ItemT]
    total: int
    has_more: bool
