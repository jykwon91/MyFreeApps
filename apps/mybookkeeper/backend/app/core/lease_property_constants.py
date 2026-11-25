"""Constants for the house (property) a lease records."""
from __future__ import annotations

LEASE_PROPERTY_NOT_FOUND_DETAIL = "Property not found"

# Machine code the clients branch on; the message is only human copy.
LISTING_PROPERTY_MISMATCH_CODE = "LISTING_PROPERTY_MISMATCH"
LISTING_PROPERTY_MISMATCH_MESSAGE = (
    "That listing is for a different house than the one you picked. "
    "Pick the listing's house, or leave the listing out."
)
