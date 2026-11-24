"""``GET /holdings``: every holding shown, largest first, with the totals and
the split by security type."""
from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.schemas.investments.holding_allocation_response import HoldingAllocationResponse
from app.schemas.investments.holding_response import HoldingResponse
from app.schemas.investments.holding_totals_response import HoldingTotalsResponse


class HoldingListResponse(BaseModel):
    # The account the list is narrowed to, or null for every account.
    financial_account_id: uuid.UUID | None = None
    currency: str
    holdings: list[HoldingResponse]
    totals: HoldingTotalsResponse
    allocation: list[HoldingAllocationResponse]
