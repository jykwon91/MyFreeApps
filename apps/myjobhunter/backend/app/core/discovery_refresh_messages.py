"""What POST /discover/sources/{id}/refresh says when a fetch fails.

Adapter errors carry provider and library text (network errors, response
bodies), so the route logs them and sends this fixed copy instead.
The fetch service stores the generic and "unavailable" lines as a saved
search's failure reason too, so the row and the reply use the same words.
"""
from typing import Final

DISCOVERY_SOURCE_UNSUPPORTED_DETAIL: Final = "This saved search can't be refreshed."
DISCOVERY_UPSTREAM_UNAVAILABLE_DETAIL: Final = (
    "The job search service is unavailable right now. Please try again in a few minutes."
)
DISCOVERY_FETCH_FAILED_DETAIL: Final = "We couldn't refresh this saved search. Please try again later."
