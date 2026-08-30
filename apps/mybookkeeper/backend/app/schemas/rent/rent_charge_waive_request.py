"""Payload for waiving a charge."""
from __future__ import annotations

from pydantic import BaseModel, Field


class RentChargeWaiveRequest(BaseModel):
    # Required: a waived charge alters the balance, so the ledger should always
    # record why. The DB check constraint enforces the same pairing.
    reason: str = Field(min_length=1, max_length=2000)
