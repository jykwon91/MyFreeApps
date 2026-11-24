"""Net worth day by day over a range, ending today."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.net_worth.net_worth_history_point import NetWorthHistoryPoint


class NetWorthHistoryResponse(BaseModel):
    # One of ``NET_WORTH_RANGES``.
    range: str
    currency: str
    # Oldest first. Starts at the first snapshot when that is inside the
    # range; empty when nothing counts toward net worth yet.
    points: list[NetWorthHistoryPoint]
