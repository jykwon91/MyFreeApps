"""``GET /cash-flow``: money in vs out per month over a range, ending this month."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel

from app.schemas.cash_flow.cash_flow_month_response import CashFlowMonthResponse
from app.schemas.cash_flow.cash_flow_totals_response import CashFlowTotalsResponse


class CashFlowResponse(BaseModel):
    # One of ``CASH_FLOW_RANGES``.
    range: str
    # One of ``CASH_FLOW_SCOPES``.
    scope: str
    # The account the figures are narrowed to; None is every account.
    account_id: uuid.UUID | None
    currency: str
    # The first day a bank feed covers. From it on, only money through an
    # account counts (``cash_basis``); None when no bank feed has brought
    # anything in, so every row counts.
    bank_history_start: _dt.date | None
    # Every month in the range, oldest first, empty months included.
    months: list[CashFlowMonthResponse]
    totals: CashFlowTotalsResponse
