"""The ``request_id`` a rent reminder text carries on its Twilio status callback URL.

``<send id>:<attempt>``, so Twilio's callbacks name the try they are about:
a retry reuses the send row, and news about an earlier try must not land on
it. A bare ``<send id>`` was sent before tries were numbered and means try 1.
"""
from __future__ import annotations

import re
import uuid

_SEPARATOR = ":"
_FIRST_ATTEMPT = 1
# ASCII digits only: str.isdigit() accepts "²", which int() then rejects.
_ATTEMPT = re.compile(r"[1-9][0-9]*")


def format_reminder_request_id(send_id: uuid.UUID, attempt: int) -> str:
    return f"{send_id}{_SEPARATOR}{attempt}"


def parse_reminder_request_id(value: str | None) -> tuple[uuid.UUID, int] | None:
    """``(send id, attempt)``, or ``None`` if ``value`` isn't one of ours."""
    if not value:
        return None
    raw_id, separator, raw_attempt = value.partition(_SEPARATOR)
    try:
        send_id = uuid.UUID(raw_id)
    except ValueError:
        return None
    if not separator:
        return send_id, _FIRST_ATTEMPT
    if not _ATTEMPT.fullmatch(raw_attempt):
        return None
    return send_id, int(raw_attempt)
