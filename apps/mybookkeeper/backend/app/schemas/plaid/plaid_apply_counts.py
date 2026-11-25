"""Running tally while one sync batch is applied."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PlaidApplyCounts:
    added: int = 0
    modified: int = 0
    removed: int = 0
    matched_existing: int = 0
    transfers_matched: int = 0
    attributed_as_rent: int = 0
