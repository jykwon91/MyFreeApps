"""One entry of ``/transactions/sync`` ``removed``."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PlaidWireRemovedTransaction(BaseModel):
    transaction_id: str

    model_config = ConfigDict(extra="ignore")
