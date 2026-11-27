"""Twilio's error codes are five-digit numbers (https://www.twilio.com/docs/api/errors).

A rent reminder's failure code only names Twilio for a number of that shape.
Rows from before the move to Twilio keep other details after the same
prefixes (the phone's own words, ``expired``, ``http_400``), which must never
be read as Twilio's. Mirrored in api-client ``rentReminderError.ts``.
"""
from __future__ import annotations

import re

# ASCII digits only: str.isdigit() also accepts "３" and "²".
_TWILIO_ERROR_CODE = re.compile(r"[0-9]{5}")


def is_twilio_error_code(value: str) -> bool:
    """True for a Twilio error number such as ``"30007"``, and nothing else."""
    return _TWILIO_ERROR_CODE.fullmatch(value) is not None
