"""Cross-field validation shared by the mortgage create and update payloads.

Mirrors the ``mortgages`` CHECK constraints at the edge so a bad payload fails
as a readable 422 rather than a 500 from an IntegrityError deeper in the stack.
The DB constraints remain the real guarantee — this is the message layer.
"""
from __future__ import annotations

from typing import TypeVar

from app.core.mortgage_enums import RATE_TYPE_ARM, RATE_TYPES

ModelT = TypeVar("ModelT")


def validate_mortgage_fields(model: ModelT, *, partial: bool = False) -> ModelT:
    """Raise ``ValueError`` if ``model``'s loan fields are inconsistent.

    ``partial`` marks a PATCH body, where an absent field means "unchanged"
    rather than "null". The paired rules would misread an absent half as a
    cleared one, so they are skipped in that mode; the service re-runs this
    against the merged row (``partial=False``), which is where they bite.
    """
    rate_type = getattr(model, "rate_type", None)
    if rate_type is not None and rate_type not in RATE_TYPES:
        raise ValueError(f"rate_type must be one of: {', '.join(RATE_TYPES)}")

    if partial:
        return model

    # A reset date on a fixed loan would be read as a rate change that is never
    # coming.
    if getattr(model, "fixed_until", None) is not None and rate_type != RATE_TYPE_ARM:
        raise ValueError("fixed_until applies only to an adjustable-rate loan")

    # A balance is only meaningful as of a date, and a date with no balance
    # describes nothing.
    balance = getattr(model, "current_balance_cents", None)
    statement_date = getattr(model, "statement_date", None)
    if (balance is None) != (statement_date is None):
        raise ValueError(
            "current_balance_cents and statement_date must be set together",
        )

    return model
