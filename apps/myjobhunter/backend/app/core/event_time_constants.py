"""Limits on when a logged application event may say it happened."""
from __future__ import annotations

import datetime as _dt

# ``occurred_at`` may run this far ahead of the server clock, so a phone or
# browser whose clock is a little fast still gets its "now" accepted.
OCCURRED_AT_CLOCK_SKEW_TOLERANCE = _dt.timedelta(minutes=5)

OCCURRED_AT_IN_FUTURE_MESSAGE = (
    "occurred_at can't be in the future. It records when the event happened; "
    "put an upcoming interview's time in interview_details.scheduled_at."
)
