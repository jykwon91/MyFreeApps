"""What happened when the order-ready SMS was sent."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReadyTextOutcome:
    """``sent`` is True only when Twilio accepted the text.

    ``error`` is the operator-facing reason when it wasn't. ``outcome_unknown``
    is True when Twilio may have taken the text anyway (a timeout or broken
    connection after the request went out, a Twilio 5xx): the customer may
    already have it, so the operator should check Twilio's message log before
    texting them by hand.
    """

    sent: bool
    error: str | None = None
    outcome_unknown: bool = False
