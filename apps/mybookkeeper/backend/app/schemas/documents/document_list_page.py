"""One page of GET /documents/page: its rows, and how many match the filters across every page."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.documents.document import DocumentRead


class DocumentListPage(ListResponse[DocumentRead]):
    pass
