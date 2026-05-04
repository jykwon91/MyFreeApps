"""Request schema for the rent receipt send endpoint."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, model_validator


class SendReceiptRequest(BaseModel):
    """Body for ``POST /api/rent-receipts/{transaction_id}/send``."""

    period_start: date
    period_end: date
    payment_method: str | None = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def period_start_before_end(self) -> "SendReceiptRequest":
        if self.period_start > self.period_end:
            raise ValueError("period_start must be on or before period_end")
        return self
