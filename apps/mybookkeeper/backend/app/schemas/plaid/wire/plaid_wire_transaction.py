"""One transaction from ``/transactions/sync`` (``added`` / ``modified``).

``amount`` is signed the Plaid way: positive is money leaving the account
(a purchase, a payment out), negative is money arriving (a deposit, a refund).
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.plaid.wire.plaid_wire_category import PlaidWireCategory


class PlaidWireTransaction(BaseModel):
    transaction_id: str
    account_id: str
    amount: Decimal
    date: _dt.date
    name: str = ""
    merchant_name: str | None = None
    pending: bool = False
    personal_finance_category: PlaidWireCategory | None = None

    model_config = ConfigDict(extra="ignore")
