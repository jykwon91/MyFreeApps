"""Cash, investments, property, cards, loans... and what each adds up to."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.net_worth.net_worth_line_response import NetWorthLineResponse


class NetWorthGroupResponse(BaseModel):
    # One of ``NET_WORTH_GROUPS``.
    key: str
    # "asset" or "liability".
    classification: str
    total_cents: int
    lines: list[NetWorthLineResponse]
