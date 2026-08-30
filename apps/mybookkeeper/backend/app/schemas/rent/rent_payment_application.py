"""One payment's contribution to one charge."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel


class RentPaymentApplication(BaseModel):
    transaction_id: uuid.UUID
    paid_on: _dt.date
    amount: Decimal
    payer_name: str | None = None
    # The payment's full value, which may exceed ``amount`` when a single
    # payment spans two periods. Surfaced so the UI can say "$375 of $375"
    # versus "$125 of $375 (rest applied to September)".
    payment_total: Decimal
