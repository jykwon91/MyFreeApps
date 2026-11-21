"""Keys and tuning for the shared transparency data."""
from __future__ import annotations

from typing import Final

# Seconds a month's donation records stay cached in memory per process.
# Building the total costs one listing plus one small read per donation that
# month; every app's public /transparency endpoint would otherwise repeat
# that on each request. A new donation shows up at most this late.
DONATION_RECORDS_CACHE_TTL_SECONDS: Final = 60.0

# Each counted Ko-fi donation is its own object at
# ``<DONATIONS_PREFIX><YYYY-MM>/<message_id><DONATION_RECORD_SUFFIX>``. One key
# per donation means two donations can never overwrite each other, and a
# re-delivery rewrites the same key instead of counting again.
DONATIONS_PREFIX: Final = "transparency/donations/"
DONATION_RECORD_SUFFIX: Final = ".json"

# A Ko-fi ``message_id`` is a UUID. Anything outside this (a UUID's
# characters, bounded length) is refused rather than reshaped, because
# reshaping could map two different ids onto one key. It also keeps ``/``
# and ``..`` out of object keys.
KOFI_MESSAGE_ID_PATTERN: Final = r"[A-Za-z0-9-]{1,100}"
