"""Limits for polling a channel's inbound iCal feed.

The feed URL is user-supplied, and ``poll_all`` polls feeds one at a time, so
one slow or huge feed would otherwise stall blackout sync for every listing.
"""
from __future__ import annotations

from typing import Final

# Seconds for any single phase (connect, one read, ...). Channels' iCal
# exports are tiny text, so this is generous.
ICAL_FEED_PHASE_TIMEOUT_SECONDS: Final = 10.0

# Seconds for the whole fetch, redirects and body included. A server that
# drips one byte just inside the phase timeout is cut off here.
ICAL_FEED_TOTAL_TIMEOUT_SECONDS: Final = 20.0

# Largest feed body read. The read stops as soon as the body passes this.
ICAL_FEED_MAX_BYTES: Final = 5_000_000

# Redirect hops followed (http to https, trailing slash, vanity host).
ICAL_FEED_MAX_REDIRECTS: Final = 5
