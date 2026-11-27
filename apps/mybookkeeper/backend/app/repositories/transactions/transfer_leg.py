from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class TransferLeg:
    """One bank row that may be one side of money moved between your own
    accounts: what the pairing rule reads, not the row itself."""

    id: uuid.UUID
    account_id: uuid.UUID
    account_institution: str | None
    account_user_id: uuid.UUID
    holder_name: str | None
    amount: Decimal
    transaction_date: _dt.date
    description: str | None
    vendor: str | None
    external_category: str | None
