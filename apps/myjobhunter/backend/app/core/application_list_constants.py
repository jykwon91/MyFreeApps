"""Paging and sorting constants for ``GET /applications``.

The list is paged and sorted on the server so every client (the web table,
the phone list, the company page) sees the same order across pages. The
status rank below is the single source of the pipeline order; clients ask for
``sort=status`` instead of ranking statuses themselves.
"""
from __future__ import annotations

from app.core.enums import EventType, RemoteType
from app.core.application_sort_field import ApplicationSortField
from app.core.sort_order import SortOrder

# A request that names no page size gets this many rows. Kept at the size the
# endpoint has always used so clients built before paging see the same page.
DEFAULT_PAGE_SIZE = 100

# The largest page a caller may ask for.
MAX_PAGE_SIZE = 500

# Applied most recently first, the order the list has always opened in.
DEFAULT_SORT_FIELD: ApplicationSortField = "applied"
DEFAULT_SORT_ORDER: SortOrder = "desc"

# Pipeline order: applied, then in process, then offer, then closed out, then
# the events that don't move an application along.
STATUS_SORT_RANKS: dict[str, int] = {
    EventType.APPLIED: 0,
    EventType.EMAIL_RECEIVED: 1,
    EventType.INTERVIEW_SCHEDULED: 2,
    EventType.INTERVIEW_COMPLETED: 3,
    EventType.OFFER_RECEIVED: 4,
    EventType.REJECTED: 5,
    EventType.WITHDRAWN: 6,
    EventType.GHOSTED: 7,
    EventType.NOTE_ADDED: 8,
    EventType.FOLLOW_UP_SENT: 9,
}

# An event type with no rank above sorts after every ranked one. Applications
# with no events at all have no status and sort last in both directions.
UNKNOWN_STATUS_SORT_RANK = len(STATUS_SORT_RANKS)

# Most remote first: remote, hybrid, on-site. "unknown" is the application not
# saying, so it has no rank and sorts last in both directions.
REMOTE_SORT_RANKS: dict[str, int] = {
    RemoteType.REMOTE: 0,
    RemoteType.HYBRID: 1,
    RemoteType.ONSITE: 2,
}
