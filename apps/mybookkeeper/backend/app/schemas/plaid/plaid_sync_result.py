"""What one sync of a bank connection did."""
from __future__ import annotations

from pydantic import BaseModel


class PlaidSyncResult(BaseModel):
    # New rows written.
    added: int = 0
    # Rows the bank changed (date, amount, name) and the app updated.
    modified: int = 0
    # Rows the bank withdrew, soft-deleted here.
    removed: int = 0
    # New bank rows that a bank import already had, so nothing was added.
    matched_existing: int = 0
    # New bank rows that were the other leg of a transfer already on file.
    transfers_matched: int = 0
    # The connection's status afterwards.
    status: str
