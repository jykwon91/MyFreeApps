"""One page of ``GET /applications`` plus how many rows match in all."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.application.application_list_item import ApplicationListItem


class ApplicationListPage(ListResponse[ApplicationListItem]):
    """``items`` is this page; ``total`` counts every matching row across pages; ``has_more`` says another page follows."""
