"""Paging constants for ``GET /recipes``."""
from __future__ import annotations

# A request that names no page size gets this many rows.
DEFAULT_RECIPE_PAGE_SIZE = 50

# The largest page a caller may ask for.
MAX_RECIPE_PAGE_SIZE = 200

# A cursor ``GET /recipes`` hands out is about 100 characters; longer is never one of ours.
MAX_RECIPE_CURSOR_LENGTH = 200
