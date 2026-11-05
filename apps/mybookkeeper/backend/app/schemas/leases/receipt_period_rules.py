"""The one rule a receipt's period must follow, shared by send and preview."""
from __future__ import annotations

import datetime as _dt

RECEIPT_PERIOD_ORDER_MESSAGE = "period_start must be on or before period_end"


def receipt_period_in_order(start: _dt.date, end: _dt.date) -> bool:
    return start <= end
