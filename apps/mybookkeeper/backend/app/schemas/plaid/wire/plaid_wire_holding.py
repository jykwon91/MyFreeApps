"""One holding in ``/investments/holdings/get`` (``holdings[]``): how much of
one security one account holds. Quantity, price, value and cost basis are
all nullable in Plaid's schema
(https://plaid.com/docs/api/products/investments/#investments-holdings-get-response-holdings).
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class PlaidWireHolding(BaseModel):
    account_id: str
    security_id: str
    quantity: Decimal | None = None
    institution_price: Decimal | None = None
    institution_price_as_of: _dt.date | None = None
    institution_value: Decimal | None = None
    cost_basis: Decimal | None = None
    iso_currency_code: str | None = None

    model_config = ConfigDict(extra="ignore")
