"""Money in and out in one calendar month."""
from __future__ import annotations

from pydantic import BaseModel


class CashFlowMonthResponse(BaseModel):
    # "YYYY-MM".
    month: str
    money_in_cents: int
    money_out_cents: int
    # in - out.
    net_cents: int
