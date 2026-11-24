"""Field-level normalisers shared by the create and update payloads.

Each returns the cleaned value or raises ``ValueError``, which Pydantic turns
into a 422 naming the field. The table's CHECK constraints are the real
guarantee; these are the readable message layer in front of them.
"""
from __future__ import annotations

import re

from app.core.financial_account_enums import ACCOUNT_TYPES
from app.core.spending_category_enums import TRANSACTION_SCOPES

_MASK_PATTERN = re.compile(r"^[A-Za-z0-9]{2,4}$")
_CURRENCY_PATTERN = re.compile(r"^[A-Z]{3}$")


def clean_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("name must not be blank")
    return stripped


def clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def check_account_type(value: str) -> str:
    if value not in ACCOUNT_TYPES:
        raise ValueError(f"account_type must be one of: {', '.join(ACCOUNT_TYPES)}")
    return value


def check_transaction_scope(value: str) -> str:
    if value not in TRANSACTION_SCOPES:
        raise ValueError(f"scope must be one of: {', '.join(TRANSACTION_SCOPES)}")
    return value


def clean_mask(value: str | None) -> str | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    if not _MASK_PATTERN.match(cleaned):
        raise ValueError(
            "mask must be the last 2-4 letters or digits of the account number",
        )
    return cleaned


def clean_currency(value: str) -> str:
    upper = value.strip().upper()
    if not _CURRENCY_PATTERN.match(upper):
        raise ValueError("currency must be a three-letter ISO 4217 code")
    return upper
