"""Turn one leg of money moved between your accounts into the one transfer row.

The ledger keeps one row per transfer, never one per leg, so nothing that
counts rows can count it twice. The kept row goes from the account the money
left to the account it arrived in, dated when it left, with what a transfer
rules out (tax fields) forced off. Pure: changes the row in memory only.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.tags import TRANSACTION_TYPE_EXPENSE, TRANSACTION_TYPE_TRANSFER, TRANSFER_CATEGORY
from app.models.transactions.transaction import Transaction
from app.services.transactions.transfer_rules import transfer_overrides


def merge_into_transfer(
    kept_leg: Transaction, *, other_account_id: uuid.UUID, other_date: _dt.date,
) -> None:
    """Make ``kept_leg`` the transfer, given the other leg's account and date."""
    if kept_leg.transaction_type == TRANSACTION_TYPE_EXPENSE:
        from_account_id, to_account_id = kept_leg.account_id, other_account_id
    else:
        from_account_id, to_account_id = other_account_id, kept_leg.account_id
        kept_leg.transaction_date = other_date
        kept_leg.tax_year = other_date.year
    kept_leg.transaction_type = TRANSACTION_TYPE_TRANSFER
    kept_leg.category = TRANSFER_CATEGORY
    kept_leg.tags = [TRANSFER_CATEGORY]
    kept_leg.spending_category_id = None
    kept_leg.account_id = from_account_id
    kept_leg.transfer_to_account_id = to_account_id
    for field, value in transfer_overrides(
        transaction_type=TRANSACTION_TYPE_TRANSFER,
        category=TRANSFER_CATEGORY,
        account_id=from_account_id,
        transfer_to_account_id=to_account_id,
    ).items():
        setattr(kept_leg, field, value)
