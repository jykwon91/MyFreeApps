"""Cross-field validation shared by the insurance-policy create and update payloads.

Mirrors the ``insurance_policies`` CHECK constraints at the edge so a bad
payload fails as a readable 422 instead of surfacing as a 500 from an
IntegrityError deeper in the stack. The DB constraints remain the real
guarantee — this is the error-message layer, not the enforcement layer.

Only fields actually set on the model are inspected, so the partial (PATCH)
payload reuses this unchanged.
"""
from __future__ import annotations

from typing import TypeVar

from app.core.insurance_enums import PREMIUM_FREQUENCIES

ModelT = TypeVar("ModelT")


def validate_policy_fields(model: ModelT, *, partial: bool = False) -> ModelT:
    """Raise ``ValueError`` if ``model``'s policy fields are inconsistent.

    ``partial`` marks a PATCH body, where an absent field means "unchanged"
    rather than "null". The premium pair rule would misread an absent half as a
    missing one, so it is skipped in that mode; the service re-runs this against
    the merged row (``partial=False``) before flushing, which is where it bites.
    """
    frequency = getattr(model, "premium_frequency", None)
    if frequency is not None and frequency not in PREMIUM_FREQUENCIES:
        raise ValueError(
            f"premium_frequency must be one of: {', '.join(PREMIUM_FREQUENCIES)}",
        )

    # An amount with no period cannot be annualised, and a period with no amount
    # describes nothing — either half alone would read as recorded while being
    # unusable, so an incomplete pair is rejected outright.
    if not partial:
        premium = getattr(model, "premium_cents", None)
        if (premium is None) != (frequency is None):
            raise ValueError(
                "premium_cents and premium_frequency must be set together",
            )

    return model
