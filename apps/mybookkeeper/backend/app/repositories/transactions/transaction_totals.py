"""How many rows a transaction filter matches across every page, and what their amounts add up to."""
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class TransactionTotals:
    count: int
    amount_total: Decimal
