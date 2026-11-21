"""What recipe discovery tells the user when its research call fails.

Our own copy, chosen by the shared failure kind: neither the HTTP detail nor
the log carries the provider's (or the shared service's) exception text.
"""
from __future__ import annotations

DISCOVERY_NOT_CONFIGURED_MESSAGE = "Recipe discovery is not configured."
DISCOVERY_BUSY_MESSAGE = "Recipe discovery is busy right now. Try again in a minute."
DISCOVERY_UNAVAILABLE_MESSAGE = "Recipe discovery isn't available right now. Try again later."
DISCOVERY_INPUT_REJECTED_MESSAGE = "We couldn't search for that. Try different words."
DISCOVERY_UNPARSEABLE_MESSAGE = "We couldn't make sense of the results."
