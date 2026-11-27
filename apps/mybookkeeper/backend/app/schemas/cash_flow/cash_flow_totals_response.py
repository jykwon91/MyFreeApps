"""Money in and out over the whole range."""
from __future__ import annotations

from pydantic import BaseModel


class CashFlowTotalsResponse(BaseModel):
    money_in_cents: int
    money_out_cents: int
    # The part of money out that paid a mortgage or a loan.
    mortgages_loans_cents: int
    net_cents: int
