"""What a saved search's row says when its last fetch failed.

Adapter errors carry provider and library text (network errors, URLs,
response bodies), so the fetch service logs them and stores one of these
as ``discovery_sources.last_error_message`` instead. The web and phone
saved-search rows show it as-is.

The two JSearch quota messages are also the 429 reply's detail on
``POST /discover/sources/{id}/refresh``, so the row and the reply agree.
"""
from typing import Final

SAVED_SEARCH_FETCH_FAILED_MESSAGE: Final = "We couldn't refresh this saved search. Please try again later."
SAVED_SEARCH_UPSTREAM_UNAVAILABLE_MESSAGE: Final = (
    "The job search service is unavailable right now. Please try again in a few minutes."
)
SAVED_SEARCH_SERVICE_NOT_SET_UP_MESSAGE: Final = (
    "The job search service isn't available right now. Please try again later."
)
SAVED_SEARCH_MISSING_QUERY_MESSAGE: Final = (
    "This saved search has no job titles or search words. Edit it to add some."
)
GREENHOUSE_BOARD_NOT_FOUND_MESSAGE: Final = (
    "We couldn't find this Greenhouse job board. Check the board name, and that the board is public."
)
LEVER_COMPANY_NOT_FOUND_MESSAGE: Final = (
    "We couldn't find this company on Lever. Check the company name, and that its jobs are public."
)

JSEARCH_MONTHLY_QUOTA_MESSAGE: Final = (
    "JSearch monthly quota reached — the RapidAPI plan is exhausted until it "
    "resets. Upgrade the plan tier or wait for the next billing cycle."
)
# ``{seconds}`` is the whole number of seconds RapidAPI's Retry-After advised.
JSEARCH_THROTTLED_MESSAGE_TEMPLATE: Final = (
    "JSearch rate limit reached — the RapidAPI plan is throttled for "
    "~{seconds}s, beyond what a single fetch will wait. Upgrade the plan "
    "tier or retry later."
)
