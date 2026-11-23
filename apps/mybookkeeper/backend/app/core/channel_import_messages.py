"""What a channel row says when its last iCal import failed.

Fetch and parse errors carry the feed's host, the SSRF guard's reason (which
names a private IP) or library text, so the poller logs them and stores one
of these as ``channel_listings.last_import_error`` instead. The web badge
shows the first 80 characters, so each line fits in that.
"""
from __future__ import annotations

from typing import Final

from platform_shared.core.capped_fetch_failure_reason import CappedFetchFailureReason

CHANNEL_IMPORT_TIMEOUT_MESSAGE: Final = "The calendar feed took too long to respond. We'll keep trying."
CHANNEL_IMPORT_NETWORK_MESSAGE: Final = "Couldn't reach the calendar feed. We'll keep trying."
CHANNEL_IMPORT_SERVER_ERROR_MESSAGE: Final = "The channel's calendar server had an error. We'll keep trying."
CHANNEL_IMPORT_ACCESS_DENIED_MESSAGE: Final = "The channel refused access to this calendar feed."
CHANNEL_IMPORT_LINK_REJECTED_MESSAGE: Final = "The channel rejected this calendar link. Check the URL."
CHANNEL_IMPORT_TOO_LARGE_MESSAGE: Final = "The calendar feed is too large to import."
CHANNEL_IMPORT_TOO_MANY_REDIRECTS_MESSAGE: Final = "The calendar link redirects too many times. Check the URL."
CHANNEL_IMPORT_NOT_A_CALENDAR_MESSAGE: Final = "The calendar link didn't return a calendar file. Check the URL."
CHANNEL_IMPORT_UNREADABLE_MESSAGE: Final = "Couldn't read the calendar feed."

# For every reason but ``http_status``, which the status code decides.
CHANNEL_IMPORT_MESSAGE_BY_FETCH_REASON: Final[dict[CappedFetchFailureReason, str]] = {
    "timeout": CHANNEL_IMPORT_TIMEOUT_MESSAGE,
    "network": CHANNEL_IMPORT_NETWORK_MESSAGE,
    "too_large": CHANNEL_IMPORT_TOO_LARGE_MESSAGE,
    "too_many_redirects": CHANNEL_IMPORT_TOO_MANY_REDIRECTS_MESSAGE,
    "bad_encoding": CHANNEL_IMPORT_NOT_A_CALENDAR_MESSAGE,
    "unexpected_content_type": CHANNEL_IMPORT_NOT_A_CALENDAR_MESSAGE,
}
