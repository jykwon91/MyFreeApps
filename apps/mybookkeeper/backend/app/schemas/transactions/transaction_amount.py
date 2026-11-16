"""Validation for a transaction amount sent by a client."""
from decimal import Decimal

from app.core.transaction_amount_constants import (
    AMOUNT_NOT_POSITIVE,
    AMOUNT_TOO_LARGE,
    AMOUNT_TOO_PRECISE,
    MAX_TRANSACTION_AMOUNT,
)

_CENT = Decimal("0.01")


def validate_transaction_amount(value: Decimal) -> Decimal:
    """Reject what the amount column would refuse or silently change.

    ``Numeric(12, 2)`` rounds sub-cent input (12.345 is stored as 12.35), and
    the ``chk_txn_amount_positive`` constraint turns zero or a negative into a
    database error the client can only report as a generic failure.
    """
    if not value.is_finite() or value <= 0:
        raise ValueError(AMOUNT_NOT_POSITIVE)
    return check_amount_fits_column(value)


def check_amount_fits_column(value: Decimal) -> Decimal:
    """Reject a finite amount a ``Numeric(12, 2)`` column would refuse or round."""
    if value > MAX_TRANSACTION_AMOUNT:
        raise ValueError(AMOUNT_TOO_LARGE)
    # Judged on the value, not the digits sent: "100.000" is whole cents.
    if value != value.quantize(_CENT):
        raise ValueError(AMOUNT_TOO_PRECISE)
    return value
