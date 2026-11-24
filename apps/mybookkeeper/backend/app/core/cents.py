"""Dollars to whole cents. Pure."""
from decimal import ROUND_HALF_UP, Decimal

_HUNDRED = Decimal(100)
_WHOLE = Decimal(1)


def to_cents(dollars: Decimal) -> int:
    """Rounded half-up: truncating would understate a figure by up to a cent."""
    return int((dollars * _HUNDRED).quantize(_WHOLE, rounding=ROUND_HALF_UP))
