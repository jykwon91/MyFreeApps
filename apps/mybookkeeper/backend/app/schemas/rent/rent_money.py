"""Shared money validation for rent-ledger request payloads."""
from __future__ import annotations

from decimal import Decimal

MAX_AMOUNT = Decimal("99999999.99")


def validate_money(value: Decimal) -> Decimal:
    """Reject negatives, absurd magnitudes, and sub-cent precision.

    ``Numeric(12, 2)`` silently rounds anything finer than a cent, so a typo
    like 1500.555 would be stored as a quietly altered charge. Surfacing it as
    a 422 instead keeps the ledger honest about what the host actually entered.
    """
    if value < 0:
        raise ValueError("amount must not be negative")
    if value > MAX_AMOUNT:
        raise ValueError("amount exceeds the maximum supported value")
    if value.as_tuple().exponent < -2:
        raise ValueError("amount must have at most 2 decimal places")
    return value
