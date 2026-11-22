"""The rows an account deletion is about to remove, keyed by table."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DeletionScope:
    """Primary-key tuples per table name, captured before anything is deleted.

    Holds candidates: rows that point at the user, and every row that cascades
    from those. After the deletion, the ones still present are discarded, so
    only what the deletion actually removed is treated as the user's.
    """

    rows_by_table: dict[str, frozenset[tuple[object, ...]]]
