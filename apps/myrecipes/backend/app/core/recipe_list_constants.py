"""Paging constants for ``GET /recipes``."""
from __future__ import annotations

# A request that names no page size gets this many rows.
DEFAULT_RECIPE_PAGE_SIZE = 50

# The largest page a caller may ask for.
MAX_RECIPE_PAGE_SIZE = 200
