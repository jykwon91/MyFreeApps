"""Paging constants for ``GET /documents``."""
from __future__ import annotations

# A request that names no page size gets this many rows.
DEFAULT_DOCUMENT_PAGE_SIZE = 100

# The largest page a caller may ask for.
MAX_DOCUMENT_PAGE_SIZE = 500
