"""The body of ``/investments/holdings/get``: the item's accounts, what each
holds, and the securities those holdings refer to."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.schemas.plaid.wire.plaid_wire_holding import PlaidWireHolding
from app.schemas.plaid.wire.plaid_wire_security import PlaidWireSecurity


class PlaidWireHoldingsResponse(BaseModel):
    accounts: list[PlaidWireAccount] = []
    holdings: list[PlaidWireHolding] = []
    securities: list[PlaidWireSecurity] = []

    model_config = ConfigDict(extra="ignore")
