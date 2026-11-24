"""Plaid's ``personal_finance_category`` on a transaction."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PlaidWireCategory(BaseModel):
    primary: str
    detailed: str | None = None

    model_config = ConfigDict(extra="ignore")
