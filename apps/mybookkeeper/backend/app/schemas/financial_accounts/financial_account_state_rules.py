"""Rules that span several columns of one account.

Checked against what the row WILL be after a create or a patch, so clearing
one half of a pair is caught as well as sending only one half. Mirrors the
table's CHECK constraints so a bad payload is a readable 422, not a 500.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.financial_account_enums import ACCOUNT_TYPE_MORTGAGE


def validate_account_state(
    *,
    account_type: str,
    current_balance_cents: int | None,
    balance_as_of: _dt.date | None,
    mortgage_id: uuid.UUID | None,
) -> None:
    if (current_balance_cents is None) != (balance_as_of is None):
        raise ValueError("A balance needs the date it was true on, and a date needs a balance")
    if mortgage_id is not None and account_type != ACCOUNT_TYPE_MORTGAGE:
        raise ValueError("Only a mortgage account can be linked to a mortgage")
