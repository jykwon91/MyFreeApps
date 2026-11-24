"""Partial update of a hand-entered holding. Omitted fields stay as they are;
``cost_basis_cents`` may be cleared with null. Whether a ticker or name is
left is checked against the merged holding by the service."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.schemas.investments.holding_field_rules import (
    check_cost_basis,
    check_price,
    check_quantity,
    check_security_type,
    clean_security_name,
    clean_ticker,
)


class HoldingUpdateRequest(BaseModel):
    ticker_symbol: str | None = None
    name: str | None = None
    security_type: str | None = None
    quantity: Decimal | None = None
    price: Decimal | None = None
    cost_basis_cents: int | None = None

    _ticker = field_validator("ticker_symbol")(clean_ticker)
    _name = field_validator("name")(clean_security_name)
    _cost_basis = field_validator("cost_basis_cents")(check_cost_basis)

    @field_validator("security_type")
    @classmethod
    def _type(cls, value: str | None) -> str | None:
        return None if value is None else check_security_type(value)

    @field_validator("quantity")
    @classmethod
    def _quantity(cls, value: Decimal | None) -> Decimal | None:
        return None if value is None else check_quantity(value)

    @field_validator("price")
    @classmethod
    def _price(cls, value: Decimal | None) -> Decimal | None:
        return None if value is None else check_price(value)
