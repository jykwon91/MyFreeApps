"""One counted payment in, with what the personal finances page sorts it by."""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class IncomeRow:
    id: uuid.UUID
    transaction_date: _dt.date
    amount: Decimal
    vendor: str | None
    description: str | None
    # One of ``TRANSACTION_SCOPES``.
    transaction_scope: str
