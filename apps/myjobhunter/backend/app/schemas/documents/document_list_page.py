"""One page of ``GET /documents`` plus how many rows match in all."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.documents.document_response import DocumentResponse


class DocumentListPage(ListResponse[DocumentResponse]):
    """``items`` is this page; ``total`` counts every matching row across pages; ``has_more`` says another page follows."""
