"""Drop rows the bank sync has already brought in. Pure.

A payment read off an email or a document, or typed in by hand, has no
account. Once the bank is connected the same payment also arrives from the
bank, so until the two are merged it is in the ledger twice. The bank's row
is the one kept: it says which account the money left.

Each bank row stands in for at most one other row, so two different payments
of the same amount a few days apart, only one of which the bank has sent yet,
both still count.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

from app.core.monthly_expense_constants import BANK_TWIN_WINDOW_DAYS
from app.core.plaid_constants import PLAID_EXTERNAL_SOURCE
from app.repositories.monthly_expenses.expense_row import ExpenseRow


def _is_bank_row(row: ExpenseRow) -> bool:
    return row.external_source == PLAID_EXTERNAL_SOURCE


def _could_have_bank_twin(row: ExpenseRow) -> bool:
    return not _is_bank_row(row) and row.account_id is None


def _is_twin(row: ExpenseRow, bank_row: ExpenseRow) -> bool:
    return (
        bank_row.transaction_type == row.transaction_type
        and bank_row.amount == row.amount
        and abs((bank_row.transaction_date - row.transaction_date).days) <= BANK_TWIN_WINDOW_DAYS
    )


def drop_bank_twins(rows: Sequence[ExpenseRow]) -> list[ExpenseRow]:
    """``rows`` without each account-less row a bank row already covers."""
    bank_rows = [row for row in rows if _is_bank_row(row)]
    claimed: set[uuid.UUID] = set()
    dropped: set[uuid.UUID] = set()
    for row in sorted((r for r in rows if _could_have_bank_twin(r)), key=lambda r: (r.transaction_date, str(r.id))):
        twins = [b for b in bank_rows if b.id not in claimed and _is_twin(row, b)]
        if not twins:
            continue
        nearest = min(twins, key=lambda b: (abs((b.transaction_date - row.transaction_date).days), b.transaction_date, str(b.id)))
        claimed.add(nearest.id)
        dropped.add(row.id)
    return [row for row in rows if row.id not in dropped]
