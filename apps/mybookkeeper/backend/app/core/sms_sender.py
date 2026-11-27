"""Reads ``SMS_SENDER_USER_ID``: the one account whose reminders may be texted."""
from __future__ import annotations

import uuid


def parse_sms_sender_user_id(raw: str) -> uuid.UUID | None:
    """The configured sender, or None when unset or not a valid id."""
    value = raw.strip()
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None
