"""Tell whether an incoming text was one of Twilio's opt-out keywords.

Twilio acts on these itself: STOP blocks further texts to the sender, START
lifts the block, HELP gets an automatic answer. A receiver only needs to know
which one it was, to explain it to whoever reads the message.
"""
from __future__ import annotations

from platform_shared.core.sms_constants import TWILIO_START_KEYWORDS, TWILIO_STOP_KEYWORDS
from platform_shared.services.twilio_opt_out_kind import TwilioOptOutKind

# Twilio's ``OptOutType`` values.
_BY_OPT_OUT_TYPE: dict[str, TwilioOptOutKind] = {"STOP": "stop", "START": "start", "HELP": "help"}


def classify_opt_out(body: str, opt_out_type: str | None) -> TwilioOptOutKind | None:
    """Which opt-out keyword the text was, or ``None`` for an ordinary message.

    ``OptOutType`` decides when Twilio sent it (Advanced Opt-Out, on a
    Messaging Service). A number texting on its own gets Twilio's default
    handling and no ``OptOutType``: then the whole text, in any case and with
    surrounding spaces ignored, is compared with Twilio's default STOP and START
    keywords. HELP is only taken from ``OptOutType``: by default Twilio answers
    HELP itself and doesn't pass it on, so a bare "help" that does arrive is an
    ordinary message.
    """
    if opt_out_type:
        return _BY_OPT_OUT_TYPE.get(opt_out_type.strip().upper())
    word = body.strip().upper()
    if word in TWILIO_STOP_KEYWORDS:
        return "stop"
    if word in TWILIO_START_KEYWORDS:
        return "start"
    return None
