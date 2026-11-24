"""One security in ``/investments/holdings/get`` (``securities[]``).

Every field but ``security_id`` is nullable in Plaid's schema
(https://plaid.com/docs/api/products/investments/#investments-holdings-get-response-securities).
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class PlaidWireSecurity(BaseModel):
    security_id: str
    name: str | None = None
    ticker_symbol: str | None = None
    type: str | None = None
    cusip: str | None = None
    isin: str | None = None
    is_cash_equivalent: bool | None = None
    close_price: Decimal | None = None
    close_price_as_of: _dt.date | None = None
    iso_currency_code: str | None = None

    model_config = ConfigDict(extra="ignore")
