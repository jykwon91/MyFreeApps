"""Cross-field validation shared by the utility-plan create and update payloads.

Mirrors the ``utility_plans`` CHECK constraints at the edge so a bad payload
fails as a readable 422 instead of surfacing as a 500 from an IntegrityError
deeper in the stack. The DB constraints remain the real guarantee — this is the
error-message layer, not the enforcement layer.

Only fields actually set on the model are inspected, so the partial (PATCH)
payload reuses this unchanged.
"""
from __future__ import annotations

from decimal import Decimal
from typing import TypeVar

from app.core.utility_plan_constants import RATE_TYPES, SERVICE_TYPES

# Rates are ¢/kWh with four decimals (a TDU charge of 5.3509 is a real value).
# The ceiling is deliberately loose — it exists to catch a unit mix-up (dollars
# entered where cents belong), not to police the market.
MAX_RATE_CENTS = Decimal("999.9999")

ModelT = TypeVar("ModelT")


def validate_plan_fields(model: ModelT) -> ModelT:
    """Raise ``ValueError`` if ``model``'s utility-plan fields are inconsistent."""
    service_type = getattr(model, "service_type", None)
    if service_type is not None and service_type not in SERVICE_TYPES:
        raise ValueError(
            f"service_type must be one of: {', '.join(sorted(SERVICE_TYPES))}",
        )

    rate_type = getattr(model, "rate_type", None)
    if rate_type is not None and rate_type not in RATE_TYPES:
        raise ValueError(
            f"rate_type must be one of: {', '.join(sorted(RATE_TYPES))}",
        )

    start = getattr(model, "service_start_date", None)
    end = getattr(model, "term_end_date", None)
    if start is not None and end is not None and end < start:
        raise ValueError("term_end_date must be on or after service_start_date")

    # A credit without its threshold (or vice versa) would make any cost
    # comparison quietly wrong, so an incomplete pair is rejected outright.
    if getattr(model, "has_bill_credit", False) and (
        getattr(model, "bill_credit_amount_cents", None) is None
        or getattr(model, "bill_credit_threshold_kwh", None) is None
    ):
        raise ValueError(
            "bill_credit_amount_cents and bill_credit_threshold_kwh are "
            "required when has_bill_credit is true",
        )

    return model
