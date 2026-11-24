"""How much of the holdings shown is in one security type."""
from __future__ import annotations

from pydantic import BaseModel


class HoldingAllocationResponse(BaseModel):
    security_type: str
    value_cents: int
    # Of the total value shown; null when that total isn't positive.
    percent: float | None = None
