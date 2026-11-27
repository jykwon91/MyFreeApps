"""What sorting one payment in needs to know about the rest of them."""
from __future__ import annotations

import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class IncomeContext:
    # Each W-2 employer's name as the words a payee has to carry.
    employers: tuple[frozenset[str], ...]
    # Payee keys that have paid rent: a payer scoped or filed as rent once is
    # a rental payer every time (a property manager, a tenant).
    rental_payers: frozenset[str]
    # Payments in that are one-offs.
    one_offs: frozenset[uuid.UUID]
