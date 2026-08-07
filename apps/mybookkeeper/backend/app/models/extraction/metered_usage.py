"""Metered consumption extracted from a utility bill."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class MeteredUsage:
    """How much was consumed on a utility bill, and over what period.

    ``quantity`` and ``unit`` are always both set or both ``None`` — a quantity
    without its unit cannot be compared against a contracted rate.
    """
    quantity: Decimal | None
    unit: str | None
    period_start: date | None
    period_end: date | None

    @classmethod
    def empty(cls) -> "MeteredUsage":
        return cls(None, None, None, None)

    @property
    def is_empty(self) -> bool:
        return (
            self.quantity is None
            and self.unit is None
            and self.period_start is None
            and self.period_end is None
        )
