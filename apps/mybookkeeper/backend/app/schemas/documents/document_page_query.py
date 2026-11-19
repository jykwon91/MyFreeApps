from pydantic import Field

from app.core.document_list_constants import (
    DEFAULT_DOCUMENT_PAGE_SIZE,
    DEFAULT_DOCUMENT_SORT_FIELD,
    MAX_DOCUMENT_PAGE_SIZE,
    DocumentSortField,
)
from app.core.transaction_sort_constants import DEFAULT_SORT_DIRECTION, SortDirection
from app.schemas.documents.document_filters import DocumentFilters


class DocumentPageQuery(DocumentFilters):
    """GET /documents/page: the filters, the order, and which page."""

    sort_by: DocumentSortField = DEFAULT_DOCUMENT_SORT_FIELD
    sort_dir: SortDirection = DEFAULT_SORT_DIRECTION
    limit: int = Field(default=DEFAULT_DOCUMENT_PAGE_SIZE, ge=1, le=MAX_DOCUMENT_PAGE_SIZE)
    offset: int = Field(default=0, ge=0)
