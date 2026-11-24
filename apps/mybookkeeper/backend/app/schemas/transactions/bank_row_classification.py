"""How one bank row is filed: type, category, tax treatment."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class BankRowClassification:
    transaction_type: str
    category: str
    amount: Decimal
    tax_relevant: bool
    schedule_e_line: str | None
