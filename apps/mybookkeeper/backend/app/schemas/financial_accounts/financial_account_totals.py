"""What the open accounts in one currency add up to."""
from __future__ import annotations

from pydantic import BaseModel


class FinancialAccountTotals(BaseModel):
    currency: str
    assets_cents: int
    liabilities_cents: int
    # assets − liabilities. Net worth from accounts only — properties are not
    # accounts (yet), so this is not the whole picture and is not labelled so.
    net_cents: int
