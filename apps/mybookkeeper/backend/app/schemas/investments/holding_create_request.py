"""Add a holding by hand to an investment account that isn't synced from a bank.

Quantity and price arrive as decimal strings (or numbers) so a fractional
share or a fund's four-decimal price survives the trip; cost basis is cents,
like every other amount.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel, field_validator, model_validator

from app.schemas.investments.holding_field_rules import (
    check_cost_basis,
    check_price,
    check_quantity,
    check_security_type,
    clean_security_name,
    clean_ticker,
)


class HoldingCreateRequest(BaseModel):
    financial_account_id: uuid.UUID
    ticker_symbol: str | None = None
    name: str | None = None
    security_type: str
    quantity: Decimal
    price: Decimal
    cost_basis_cents: int | None = None

    _ticker = field_validator("ticker_symbol")(clean_ticker)
    _name = field_validator("name")(clean_security_name)
    _type = field_validator("security_type")(check_security_type)
    _quantity = field_validator("quantity")(check_quantity)
    _price = field_validator("price")(check_price)
    _cost_basis = field_validator("cost_basis_cents")(check_cost_basis)

    @model_validator(mode="after")
    def _identified(self) -> HoldingCreateRequest:
        if self.ticker_symbol is None and self.name is None:
            raise ValueError("Give the holding a ticker or a name")
        return self
