"""One text (or picture message) someone sent to our Twilio number."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TwilioInboundMessage:
    """The parts of Twilio's incoming-message webhook a receiver acts on.

    Media URLs are left out on purpose: nothing downstream may fetch or link
    what a sender attached, only count it. ``from_number`` and ``to_number`` are
    exactly as Twilio sent them (E.164 for a text, ``whatsapp:+1...`` and the
    like for other channels), so a caller decides how strictly to read them.
    """

    message_sid: str | None
    account_sid: str | None
    from_number: str | None
    to_number: str | None
    body: str
    # One MIME type per attachment (``image/jpeg``), in Twilio's order.
    media_content_types: tuple[str, ...]
    # Set by Twilio's Advanced Opt-Out (a Messaging Service only): ``STOP``,
    # ``START`` or ``HELP`` when the message was one of those keywords.
    opt_out_type: str | None
