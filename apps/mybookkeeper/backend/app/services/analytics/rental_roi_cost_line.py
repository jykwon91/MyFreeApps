"""One line of a property's break-even, in Decimal dollars before rounding to cents."""
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class RentalRoiCostLine:
    category: str
    monthly: Decimal
    # What the window's transactions add up to; None when a loan record states the amount.
    window_total: Decimal | None
