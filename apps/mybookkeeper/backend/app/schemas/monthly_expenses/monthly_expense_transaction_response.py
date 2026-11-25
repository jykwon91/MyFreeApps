"""One payment counted under a heading: when, to whom, from which account."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel


class MonthlyExpenseTransactionResponse(BaseModel):
    id: uuid.UUID
    date: _dt.date
    # Who was paid, read off the merchant or the payment's name.
    payee: str
    # The bank's or the receipt's own wording, when it says more than the payee.
    description: str | None
    # The account the money left; all None for a row with no account.
    account_name: str | None
    account_institution: str | None
    account_mask: str | None
    amount_cents: int
