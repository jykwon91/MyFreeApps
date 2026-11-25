"""What the spending rules know beyond the row itself."""
from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ExpenseContext:
    # Each tracked mortgage's whole monthly payment, in cents.
    mortgage_payments: frozenset[int] = frozenset()
    # The loan-payment rows that paid one of your cards.
    card_payments: frozenset[uuid.UUID] = frozenset()
    # Account owner -> the name they go by.
    holder_names: Mapping[uuid.UUID, str] = field(default_factory=dict)
