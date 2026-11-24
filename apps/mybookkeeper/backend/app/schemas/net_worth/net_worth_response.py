"""A person's net worth today: the total, and every line behind it."""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel

from app.schemas.net_worth.net_worth_group_response import NetWorthGroupResponse


class NetWorthResponse(BaseModel):
    currency: str
    as_of: _dt.date
    assets_cents: int
    liabilities_cents: int
    net_cents: int
    # In ``NET_WORTH_GROUPS`` order; a group with nothing in it is left out,
    # so an empty list means there is nothing to show yet.
    groups: list[NetWorthGroupResponse]
