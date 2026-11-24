"""Net worth on one day."""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel


class NetWorthHistoryPoint(BaseModel):
    day: _dt.date
    assets_cents: int
    liabilities_cents: int
    net_cents: int
