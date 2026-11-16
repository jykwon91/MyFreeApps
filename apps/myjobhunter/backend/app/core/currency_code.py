"""ISO 4217 currency-code normalisation and validation.

Currency codes reach the database from several writers (user-submitted
application / profile forms, AI JD extraction, discovery promotion). Every
writer funnels through ``normalize_currency_code`` so a malformed value such
as ``"CA$"`` can never be stored — the frontend hands the stored code to
``Intl.NumberFormat`` which rejects anything that is not three ASCII letters.
"""
from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator

CURRENCY_CODE_LENGTH = 3
_CURRENCY_CODE_RE = re.compile(r"^[A-Z]{3}$")


def normalize_currency_code(value: object) -> str | None:
    """Return the upper-cased 3-letter code, or ``None`` when ``value`` is not one."""
    if not isinstance(value, str):
        return None
    code = value.strip().upper()
    return code if _CURRENCY_CODE_RE.match(code) else None


def _require_currency_code(value: str) -> str:
    code = normalize_currency_code(value)
    if code is None:
        raise ValueError("must be a 3-letter ISO 4217 currency code (e.g. USD)")
    return code


CurrencyCode = Annotated[str, AfterValidator(_require_currency_code)]
