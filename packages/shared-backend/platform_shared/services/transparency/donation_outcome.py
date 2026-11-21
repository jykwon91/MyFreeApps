"""What the Ko-fi webhook did with one verified payload."""
from __future__ import annotations

from enum import Enum


class DonationOutcome(Enum):
    """Result of ``kofi_service.record_donation``.

    - ``RECORDED``: newly stored.
    - ``DUPLICATE``: already counted (a Ko-fi re-delivery).
    - ``REFUSED``: verified but unusable (no valid ``message_id`` or
      ``timestamp``), so it cannot be keyed or deduped and is not counted.
      Logged at ERROR so the operator can reconcile it by hand.
    """

    RECORDED = "recorded"
    DUPLICATE = "duplicate"
    REFUSED = "refused"
