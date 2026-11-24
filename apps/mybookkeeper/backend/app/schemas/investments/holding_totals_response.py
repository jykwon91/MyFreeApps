"""The holdings shown, added up.

``cost_basis_cents`` adds the holdings whose cost basis is known; gain/loss
covers only the holdings that have both a value and a cost basis, and its
percent is of their cost basis.
"""
from __future__ import annotations

from pydantic import BaseModel


class HoldingTotalsResponse(BaseModel):
    value_cents: int
    cost_basis_cents: int | None = None
    gain_loss_cents: int | None = None
    gain_loss_percent: float | None = None
