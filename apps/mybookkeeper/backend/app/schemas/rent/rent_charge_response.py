"""A single dated obligation, with its derived settlement state."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.rent.rent_payment_application import RentPaymentApplication


class RentChargeResponse(BaseModel):
    id: uuid.UUID
    schedule_id: uuid.UUID | None = None
    charge_type: str
    period_start: _dt.date
    period_end: _dt.date
    due_date: _dt.date
    amount: Decimal
    # The schedule's undivided amount, when this period was prorated for a
    # part-month tenancy. ``None`` for a whole period or a one-off charge, so
    # the client can say "$822.58 of $1,500.00, prorated" instead of leaving a
    # short number looking like a mistake.
    full_amount: Decimal | None = None
    description: str | None = None
    waived_at: _dt.datetime | None = None
    waived_reason: str | None = None

    # Derived by the FIFO allocator — never stored.
    allocated: Decimal
    remaining: Decimal
    status: str
    applications: list[RentPaymentApplication]
