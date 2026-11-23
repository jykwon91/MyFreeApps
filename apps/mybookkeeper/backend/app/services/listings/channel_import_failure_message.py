"""The fixed copy a failed iCal import stores, chosen by the error's class."""
from __future__ import annotations

from platform_shared.core.capped_fetch_error import CappedFetchError
from platform_shared.core.url_safety import UnsafeURLError
from platform_shared.core.url_safety_messages import UNSAFE_URL_DETAIL

from app.core.channel_import_messages import (
    CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE,
    CHANNEL_IMPORT_LINK_REJECTED_MESSAGE,
    CHANNEL_IMPORT_MESSAGE_BY_FETCH_REASON,
    CHANNEL_IMPORT_SERVER_ERROR_MESSAGE,
    CHANNEL_IMPORT_UNREADABLE_MESSAGE,
)


def import_failure_message(exc: BaseException) -> str:
    """What the channel row says about ``exc``; never its text."""
    if isinstance(exc, UnsafeURLError):
        return UNSAFE_URL_DETAIL
    if not isinstance(exc, CappedFetchError):
        return CHANNEL_IMPORT_UNREADABLE_MESSAGE
    if exc.reason != "http_status":
        return CHANNEL_IMPORT_MESSAGE_BY_FETCH_REASON[exc.reason]
    if exc.status_code in (401, 403):
        return CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE
    if exc.status_code is not None and 400 <= exc.status_code < 500:
        return CHANNEL_IMPORT_LINK_REJECTED_MESSAGE
    return CHANNEL_IMPORT_SERVER_ERROR_MESSAGE
