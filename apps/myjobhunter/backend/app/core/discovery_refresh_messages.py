"""What POST /discover/sources/{id}/refresh says when a fetch fails.

Adapter errors carry provider and library text (network errors, response
bodies), so the route logs them and sends this fixed copy instead.
"""
from typing import Final

DISCOVERY_SOURCE_UNSUPPORTED_DETAIL: Final = "This saved search can't be refreshed."
DISCOVERY_UPSTREAM_UNAVAILABLE_DETAIL: Final = (
    "The job search service is unavailable right now. Please try again in a few minutes."
)
DISCOVERY_FETCH_FAILED_DETAIL: Final = "We couldn't refresh this saved search. Please try again later."
