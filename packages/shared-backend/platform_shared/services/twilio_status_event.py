"""What one Twilio message status callback says about a text."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TwilioStatusEvent:
    """The parts of a message status callback a sender acts on."""

    message_sid: str | None
    status: str
    # Twilio's numeric error code as sent (e.g. ``"30007"``); only on
    # ``undelivered`` / ``failed``.
    error_code: str | None
