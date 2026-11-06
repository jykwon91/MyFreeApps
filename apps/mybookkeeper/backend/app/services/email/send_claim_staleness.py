"""When an earlier Gmail send attempt may be presumed finished or abandoned."""
from __future__ import annotations

import datetime as _dt

from app.services.email.constants import GMAIL_SEND_CLAIM_STALE_AFTER


def is_send_claim_stale(claimed_at: _dt.datetime, now: _dt.datetime) -> bool:
    """True once a claim is old enough to settle by looking it up in Gmail.

    SQLite (the test database) hands timestamps back naive; they are UTC.
    """
    if claimed_at.tzinfo is None:
        claimed_at = claimed_at.replace(tzinfo=_dt.timezone.utc)
    return now - claimed_at >= GMAIL_SEND_CLAIM_STALE_AFTER
