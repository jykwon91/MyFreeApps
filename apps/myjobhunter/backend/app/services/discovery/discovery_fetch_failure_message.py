"""Choose what a saved search stores as the reason its fetch failed.

Adapter exceptions carry provider and library text, so the stored reason is
fixed copy picked by the exception's class. ``JSearchQuotaError`` is the one
exception whose message is written for the user; it is stored as-is so the
row matches the 429 reply the refresh route sends with the same text.
"""
from __future__ import annotations

from app.core.discovery_source_failure_messages import (
    GREENHOUSE_BOARD_NOT_FOUND_MESSAGE,
    LEVER_COMPANY_NOT_FOUND_MESSAGE,
    SAVED_SEARCH_FETCH_FAILED_MESSAGE,
    SAVED_SEARCH_MISSING_QUERY_MESSAGE,
    SAVED_SEARCH_SERVICE_NOT_SET_UP_MESSAGE,
    SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE,
)
from app.services.discovery.discovery_fetch_errors import DiscoverySourceMissingQueryError
from app.services.discovery.sources.greenhouse import (
    GreenhouseInvalidBoardError,
    GreenhouseTransientError,
)
from app.services.discovery.sources.jsearch import (
    JSearchAuthError,
    JSearchQuotaError,
    JSearchTransientError,
)
from app.services.discovery.sources.lever import LeverInvalidSlugError, LeverTransientError

_FIXED_MESSAGES: tuple[tuple[type[Exception], str], ...] = (
    (JSearchAuthError, SAVED_SEARCH_SERVICE_NOT_SET_UP_MESSAGE),
    (JSearchTransientError, SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE),
    (GreenhouseTransientError, SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE),
    (LeverTransientError, SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE),
    (GreenhouseInvalidBoardError, GREENHOUSE_BOARD_NOT_FOUND_MESSAGE),
    (LeverInvalidSlugError, LEVER_COMPANY_NOT_FOUND_MESSAGE),
    (DiscoverySourceMissingQueryError, SAVED_SEARCH_MISSING_QUERY_MESSAGE),
)


def stored_failure_message(exc: Exception) -> str:
    """The reason to store on the saved search for an adapter failure."""
    if isinstance(exc, JSearchQuotaError):
        return str(exc)
    for error_class, message in _FIXED_MESSAGES:
        if isinstance(exc, error_class):
            return message
    return SAVED_SEARCH_FETCH_FAILED_MESSAGE
