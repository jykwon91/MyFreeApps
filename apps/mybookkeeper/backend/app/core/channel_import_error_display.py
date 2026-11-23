"""Which stored iCal import errors are safe to show.

Rows written before imports stored fixed copy can still hold raw error text:
the feed's host and, for a URL the SSRF guard refused, the private IP it
resolved to. The next poll overwrites it, but a row whose import URL was
cleared is never polled again. Until then, anything that isn't one of the
fixed messages is shown as the generic line. Stored data is left as-is.
"""
from __future__ import annotations

from platform_shared.core.url_safety_messages import UNSAFE_URL_DETAIL

from app.core.channel_import_messages import (
    CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE,
    CHANNEL_IMPORT_LINK_REJECTED_MESSAGE,
    CHANNEL_IMPORT_MESSAGE_BY_FETCH_REASON,
    CHANNEL_IMPORT_SERVER_ERROR_MESSAGE,
    CHANNEL_IMPORT_UNREADABLE_MESSAGE,
)

_FIXED_MESSAGES: frozenset[str] = frozenset({
    UNSAFE_URL_DETAIL,
    CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE,
    CHANNEL_IMPORT_LINK_REJECTED_MESSAGE,
    CHANNEL_IMPORT_SERVER_ERROR_MESSAGE,
    CHANNEL_IMPORT_UNREADABLE_MESSAGE,
    *CHANNEL_IMPORT_MESSAGE_BY_FETCH_REASON.values(),
})


def displayable_import_error(stored: str | None) -> str | None:
    """``stored`` if it is fixed copy, the generic line for any other text."""
    if not stored or stored in _FIXED_MESSAGES:
        return stored
    return CHANNEL_IMPORT_UNREADABLE_MESSAGE
