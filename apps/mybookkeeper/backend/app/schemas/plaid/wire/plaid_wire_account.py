"""One account in a Plaid item (``/accounts/get``, ``/transactions/sync``)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.plaid.wire.plaid_wire_balances import PlaidWireBalances


class PlaidWireAccount(BaseModel):
    account_id: str
    name: str
    official_name: str | None = None
    mask: str | None = None
    type: str
    subtype: str | None = None
    balances: PlaidWireBalances = PlaidWireBalances()

    model_config = ConfigDict(extra="ignore")
