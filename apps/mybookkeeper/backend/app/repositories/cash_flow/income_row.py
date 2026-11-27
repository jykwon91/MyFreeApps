"""One payment in, with what Cash flow and the personal finances page sort it by."""
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
    # MBK's category ("rental_revenue", "uncategorized", ...).
    category: str
    # One of ``TRANSACTION_SCOPES``.
    transaction_scope: str
    # Plaid's primary category, None for a bank CSV or a typed-in row.
    external_category: str | None = None
    # Whose account it arrived on, None when it isn't on an account.
    account_user_id: uuid.UUID | None = None
