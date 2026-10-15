"""E.164 normalization for SMS recipients.

Phone numbers are stored as typed ("(713) 555-0100", "713.555.0100",
"+1 713 555 0100"); SMS providers want E.164 ("+17135550100"). Numbers
without a country code are read as North American (NANP), which is every
number MyFreeApps texts today — anything else must be entered with its ``+``.
"""
from __future__ import annotations

import re

_NON_DIGITS = re.compile(r"\D+")
_NANP_LENGTH = 10
_E164_MIN_DIGITS = 8
_E164_MAX_DIGITS = 15


def to_e164(raw: str | None) -> str | None:
    """Return ``raw`` as E.164, or ``None`` if it can't be read as a phone number."""
    text = (raw or "").strip()
    if not text:
        return None
    digits = _NON_DIGITS.sub("", text)
    if text.startswith("+"):
        if _E164_MIN_DIGITS <= len(digits) <= _E164_MAX_DIGITS:
            return f"+{digits}"
        return None
    if len(digits) == _NANP_LENGTH:
        return f"+1{digits}"
    if len(digits) == _NANP_LENGTH + 1 and digits.startswith("1"):
        return f"+{digits}"
    return None
