"""One holding as the Investments page shows it.

``price`` / ``price_as_of`` / ``value_cents`` are the account holder's figures
(Plaid's for a synced account, the person's own for one kept by hand).
Gain/loss is value minus cost basis, null when either is unknown; the percent
is of the cost basis, null when that is zero.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel


class HoldingResponse(BaseModel):
    id: uuid.UUID
    financial_account_id: uuid.UUID
    account_name: str
    # Typed in by the person (editable here) rather than synced from a bank.
    is_manual: bool
    security_id: uuid.UUID
    ticker_symbol: str | None = None
    name: str | None = None
    security_type: str
    quantity: Decimal | None = None
    price: Decimal | None = None
    price_as_of: _dt.date | None = None
    is_price_stale: bool
    value_cents: int | None = None
    cost_basis_cents: int | None = None
    gain_loss_cents: int | None = None
    gain_loss_percent: float | None = None
    currency: str
