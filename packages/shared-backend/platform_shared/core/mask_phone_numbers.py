"""Hide phone numbers in text that is logged or shown to someone."""
from __future__ import annotations

import re

# Phone-number shapes only: E.164 (``+15125550199``), a grouped number with an
# optional country code (``+1 555-987-6543``, ``(713) 555-0100``,
# ``+44 20 7946 0958``) or a bare run of 10-15 digits. A match can't start or
# end inside a longer number, so dates (``2026-11-21``), IP addresses, times
# and long ids stay as they are. A bare run may follow a label with no space
# (``to:5125550199``, ``phone_5125550199``); the other shapes may not follow a
# letter, digit, dot or colon.
_PHONE_SHAPED = re.compile(
    r"(?:"
    r"(?<![\w.:])"
    r"(?:\+\d{8,15}|(?:\+\d{1,3}[ .-]?)?\(?\d{2,4}\)?[ .-]?\d{3,4}[ .-]?\d{3,5})"
    r"|(?<![\d.])\d{10,15}"
    r")"
    r"(?!\d|[.:-]\d)"
)
_MIN_DIGITS = 10
_MIN_DIGITS_WITH_COUNTRY_CODE = 8
_MAX_DIGITS = 15
PHONE_NUMBER_PLACEHOLDER = "[phone number]"


def _mask(match: re.Match[str]) -> str:
    text = match.group(0)
    digits = sum(ch.isdigit() for ch in text)
    fewest = _MIN_DIGITS_WITH_COUNTRY_CODE if text.startswith("+") else _MIN_DIGITS
    return PHONE_NUMBER_PLACEHOLDER if fewest <= digits <= _MAX_DIGITS else text


def mask_phone_numbers(text: str) -> str:
    """``text`` with every phone number replaced by a placeholder."""
    return _PHONE_SHAPED.sub(_mask, text)
