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
