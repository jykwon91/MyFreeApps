"""Field-level normalisers for a hand-entered holding, shared by the create and
update payloads.

Each returns the cleaned value or raises ``ValueError``, which Pydantic turns
into a 422 naming the field.
"""
from __future__ import annotations

import re
from decimal import Decimal

from app.core.investment_enums import (
    MANUAL_MAX_PRICE,
    MANUAL_MAX_QUANTITY,
    PRICE_SCALE,
    QUANTITY_SCALE,
    SECURITY_NAME_MAX_LENGTH,
    SECURITY_TYPES,
    TICKER_MAX_LENGTH,
)

# Letters, digits and the separators exchanges use (BRK.B, BRK-B, ^GSPC, BTC/USD).
_TICKER_PATTERN = re.compile(rf"^[A-Z0-9.\-/^]{{1,{TICKER_MAX_LENGTH}}}$")


def clean_ticker(value: str | None) -> str | None:
    if value is None:
        return None
    ticker = value.strip().upper()
    if not ticker:
        return None
    if not _TICKER_PATTERN.match(ticker):
        raise ValueError(
            f"ticker must be up to {TICKER_MAX_LENGTH} letters, digits or . - / ^ with no spaces",
        )
    return ticker


def clean_security_name(value: str | None) -> str | None:
    if value is None:
        return None
    name = value.strip()
    if len(name) > SECURITY_NAME_MAX_LENGTH:
        raise ValueError(f"name must be at most {SECURITY_NAME_MAX_LENGTH} characters")
    return name or None


def check_security_type(value: str) -> str:
    if value not in SECURITY_TYPES:
        raise ValueError(f"security_type must be one of: {', '.join(SECURITY_TYPES)}")
    return value


def _decimal_places(value: Decimal) -> int:
    exponent = value.normalize().as_tuple().exponent
    return -exponent if isinstance(exponent, int) and exponent < 0 else 0


def check_quantity(value: Decimal) -> Decimal:
    if not value.is_finite() or value <= 0:
        raise ValueError("quantity must be more than zero")
    if value > MANUAL_MAX_QUANTITY:
        raise ValueError("quantity is too large")
    if _decimal_places(value) > QUANTITY_SCALE:
        raise ValueError(f"quantity can have at most {QUANTITY_SCALE} decimal places")
    return value


def check_price(value: Decimal) -> Decimal:
    if not value.is_finite() or value < 0:
        raise ValueError("price must not be negative")
    if value > MANUAL_MAX_PRICE:
        raise ValueError("price is too large")
    if _decimal_places(value) > PRICE_SCALE:
        raise ValueError(f"price can have at most {PRICE_SCALE} decimal places")
    return value


def check_cost_basis(value: int | None) -> int | None:
    if value is not None and value < 0:
        raise ValueError("cost_basis_cents must not be negative")
    return value
