"""How the documents list may be narrowed, ordered and paged. The api-client's DocumentSortField mirrors these."""
from typing import Literal

DocumentSortField = Literal["created_at", "file_name", "document_type", "status", "source"]

# Newest first: the order the list had before it could be chosen.
DEFAULT_DOCUMENT_SORT_FIELD: DocumentSortField = "created_at"

# GET /documents/page: rows per page by default, and at most.
DEFAULT_DOCUMENT_PAGE_SIZE = 50
MAX_DOCUMENT_PAGE_SIZE = 100

# The longest file-name search accepted.
MAX_DOCUMENT_SEARCH_LENGTH = 200

# Left out of the library (exclude_processing): still being read, a duplicate of one already read, or gone.
DOCUMENT_NOT_IN_LIBRARY_STATUSES = ("processing", "extracting", "duplicate", "deleted")
