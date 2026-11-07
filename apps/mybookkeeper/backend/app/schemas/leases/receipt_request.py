"""Request schema for the rent receipt send endpoint."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, model_validator

from app.schemas.dates.client_local_date import ClientLocalDate
from app.schemas.leases.receipt_period_rules import (
    RECEIPT_PERIOD_ORDER_MESSAGE,
    receipt_period_in_order,
)


class SendReceiptRequest(BaseModel):
    """Body for ``POST /api/rent-receipts/{transaction_id}/send``."""

    period_start: date
    period_end: date
    payment_method: str | None = None
    today: ClientLocalDate

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def period_start_before_end(self) -> "SendReceiptRequest":
        if not receipt_period_in_order(self.period_start, self.period_end):
            raise ValueError(RECEIPT_PERIOD_ORDER_MESSAGE)
        return self
