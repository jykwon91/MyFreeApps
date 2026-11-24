"""One page of ``/transactions/sync``."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.schemas.plaid.wire.plaid_wire_removed_transaction import PlaidWireRemovedTransaction
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction


class PlaidWireSyncPage(BaseModel):
    added: list[PlaidWireTransaction] = []
    modified: list[PlaidWireTransaction] = []
    removed: list[PlaidWireRemovedTransaction] = []
    accounts: list[PlaidWireAccount] = []
    next_cursor: str
    has_more: bool

    model_config = ConfigDict(extra="ignore")
