"""Payload for a one-off charge — a late fee, reimbursement, or deposit."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.core.rent_ledger_enums import RENT_CHARGE_TYPES
from app.schemas.rent.rent_money import validate_money


class RentChargeCreateRequest(BaseModel):
    applicant_id: uuid.UUID
    amount: Decimal
    due_date: _dt.date
    charge_type: str = "other"
    period_start: _dt.date | None = None
    period_end: _dt.date | None = None
    description: str | None = None

    @field_validator("amount")
    @classmethod
    def _check_amount(cls, v: Decimal) -> Decimal:
        return validate_money(v)

    @field_validator("charge_type")
    @classmethod
    def _check_type(cls, v: str) -> str:
        if v not in RENT_CHARGE_TYPES:
            raise ValueError(
                f"charge_type must be one of {', '.join(RENT_CHARGE_TYPES)}",
            )
        return v
