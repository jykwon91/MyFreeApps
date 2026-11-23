"""Which stored saved-search failure reasons are safe to show.

Rows written before fetch failures stored fixed copy can still hold an
adapter's raw text (network errors, URLs, provider bodies). The next fetch
overwrites it; until then, anything that isn't one of the fixed messages
is shown as the generic line.
"""
from __future__ import annotations

import re

from app.core.discovery_source_failure_messages import (
    GREENHOUSE_BOARD_NOT_FOUND_MESSAGE,
    JSEARCH_MONTHLY_QUOTA_MESSAGE,
    JSEARCH_THROTTLED_MESSAGE_TEMPLATE,
    LEVER_COMPANY_NOT_FOUND_MESSAGE,
    SAVED_SEARCH_FETCH_FAILED_MESSAGE,
    SAVED_SEARCH_MISSING_QUERY_MESSAGE,
    SAVED_SEARCH_SERVICE_NOT_SET_UP_MESSAGE,
    SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE,
)

_FIXED_MESSAGES: frozenset[str] = frozenset({
    GREENHOUSE_BOARD_NOT_FOUND_MESSAGE,
    JSEARCH_MONTHLY_QUOTA_MESSAGE,
    LEVER_COMPANY_NOT_FOUND_MESSAGE,
    SAVED_SEARCH_FETCH_FAILED_MESSAGE,
    SAVED_SEARCH_MISSING_QUERY_MESSAGE,
    SAVED_SEARCH_SERVICE_NOT_SET_UP_MESSAGE,
    SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE,
})

_THROTTLED_MESSAGE_RE = re.compile(
    re.escape(JSEARCH_THROTTLED_MESSAGE_TEMPLATE).replace(re.escape("{seconds}"), r"\d+"),
)


def displayable_failure_message(stored: str | None) -> str | None:
    """``stored`` if it is fixed copy, the generic line for any other text."""
    if stored is None or stored in _FIXED_MESSAGES or _THROTTLED_MESSAGE_RE.fullmatch(stored):
        return stored
    return SAVED_SEARCH_FETCH_FAILED_MESSAGE
