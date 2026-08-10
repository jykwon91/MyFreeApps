"""Constants for the unified calendar viewer.

Lives in ``core/`` because both the route handler and the service layer
read these — keeping them out of either file prevents drift if they ever
need to change (e.g., raising the window cap).
"""
from __future__ import annotations

# Default window applied when ``from`` and ``to`` are both omitted on
# ``GET /api/calendar/events``. Matches the spec — today → today + 90 days
# is a reasonable default for a host scanning their next quarter.
DEFAULT_WINDOW_DAYS: int = 90

# Hard cap on the requested window. A custom integration that asked for
# 5 years of blackouts would otherwise scan the entire blackout table
# in one go. 365 days is a year — anything beyond that is almost
# certainly a mistake.
MAX_WINDOW_DAYS: int = 365

# Source slug for occupancy derived from a signed lease. Unlike every other
# slug this is NOT a channel — leases arrive through the lease flow, not an
# iCal poll, and have no ``listing_blackouts`` row. The viewer unions them in
# from ``signed_leases`` so a host sees tenant occupancy next to channel
# bookings. Events carrying this source are read-only: their ``id`` is a lease
# id, so the blackout notes/attachment endpoints do not apply to them.
LEASE_SOURCE: str = "lease"

# Lease statuses that represent real occupancy on the calendar.
#
# ``draft`` / ``generated`` / ``sent`` are still being negotiated — nobody has
# moved in, so blocking the dates would be wrong. ``terminated`` ended early,
# meaning the stored ``ends_on`` no longer describes the stay.
#
# Same three statuses as ``services.leases._lease_helpers``'s
# PARENT_ALLOWED_STATUSES, but deliberately a separate constant: that one
# answers "can this lease have a successor", this one answers "did someone
# actually live here". They agree today for unrelated reasons.
LEASE_OCCUPANCY_STATUSES: frozenset[str] = frozenset({"signed", "active", "ended"})
