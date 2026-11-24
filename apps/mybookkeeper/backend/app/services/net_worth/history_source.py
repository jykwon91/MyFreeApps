"""What the history needs to know about one source, from how it stands today."""
from __future__ import annotations

from dataclasses import dataclass

from app.services.net_worth.snapshot_source_key import SnapshotSourceKey


@dataclass(frozen=True)
class HistorySource:
    classification: str
    currency: str
    # In today's total. A source that no longer is (a closed account, a sold
    # home, a loan now tracked by its account) counts through its last
    # snapshot and then stops, instead of carrying a stale value forward.
    counted_today: bool
    # For a loan record now linked to an account: the account. On any day the
    # account has a value, the account is the loan and the record is skipped.
    represented_by: SnapshotSourceKey | None = None
