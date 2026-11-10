"""One page of ``GET /applications`` plus how many rows match in all."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.application.application_list_item import ApplicationListItem


class ApplicationListPage(BaseModel):
    """``items`` is this page; ``total`` counts every matching row across pages."""

    items: list[ApplicationListItem]
    total: int
