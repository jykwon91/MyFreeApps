"""Everything one /transactions/sync run returned, all pages joined."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction


class PlaidSyncBatch(BaseModel):
    added: list[PlaidWireTransaction]
    modified: list[PlaidWireTransaction]
    removed: list[str]
    accounts: list[PlaidWireAccount]
    next_cursor: str
