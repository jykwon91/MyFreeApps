"""A rent payment as it appears in the ledger's payment list."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel


class RentPaymentResponse(BaseModel):
    transaction_id: uuid.UUID
    paid_on: _dt.date
    amount: Decimal
    payer_name: str | None = None
    payment_method: str | None = None
    # Amount of this payment not yet consumed by any charge — the tenant is
    # paid ahead. Zero for a fully applied payment.
    unapplied: Decimal
    # The periods this payment settled, e.g. ["August 2026", "September 2026"].
    # Empty when the payment is entirely unapplied.
    applied_to: list[str]
