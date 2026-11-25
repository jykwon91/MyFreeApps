"""One row that might be money spent, with what the rules need to decide."""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class ExpenseRow:
    id: uuid.UUID
    transaction_date: _dt.date
    amount: Decimal
    # "expense" or "transfer".
    transaction_type: str
    # "plaid" for a bank-synced row; None or another source otherwise.
    external_source: str | None
    # Plaid's primary category, when the bank sync brought the row in.
    external_category: str | None
    category: str
    spending_category_name: str | None
    description: str | None
    vendor: str | None
    # The account the money left and whose it is. All None for a row with no
    # account.
    account_id: uuid.UUID | None
    account_type: str | None
    account_name: str | None
    account_institution: str | None
    account_mask: str | None
    account_user_id: uuid.UUID | None
    # The account a transfer arrived in; None when it isn't one of yours.
    to_account_type: str | None
