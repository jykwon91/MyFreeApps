"""The 'how much has been paid for this period' answer, precomputed."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel


class RentPeriodSummary(BaseModel):
    charge_id: uuid.UUID
    label: str
    period_start: _dt.date
    period_end: _dt.date
    amount: Decimal
    allocated: Decimal
    remaining: Decimal
    status: str
