"""Money that arrived on a credit card: the card side of a card payment."""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class CardPaymentArrival:
    transaction_date: _dt.date
    amount: Decimal
