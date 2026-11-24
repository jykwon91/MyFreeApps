"""``/accounts/get``."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount


class PlaidWireAccountsResponse(BaseModel):
    accounts: list[PlaidWireAccount]

    model_config = ConfigDict(extra="ignore")
