"""An account's balances as Plaid reports them (``accounts[].balances``)."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class PlaidWireBalances(BaseModel):
    """``current`` is what the bank's statement says: the money held on a
    depository account, the amount owed on a credit or loan account."""

    current: Decimal | None = None
    iso_currency_code: str | None = None

    model_config = ConfigDict(extra="ignore")
