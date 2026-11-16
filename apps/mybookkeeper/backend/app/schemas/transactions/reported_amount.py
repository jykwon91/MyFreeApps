"""Validation for the amount a host types in from a 1099."""
from decimal import Decimal

from app.core.transaction_amount_constants import AMOUNT_NEGATIVE
from app.schemas.transactions.transaction_amount import check_amount_fits_column


def validate_reported_amount(value: Decimal) -> Decimal:
    """A 1099 can report $0 but never a negative, and the column keeps whole cents only."""
    if not value.is_finite() or value < 0:
        raise ValueError(AMOUNT_NEGATIVE)
    return check_amount_fits_column(value)
