"""Payload for creating a recurring rent obligation."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.rent_ledger_enums import RENT_CADENCES
from app.schemas.rent.rent_money import validate_money


class RentScheduleCreateRequest(BaseModel):
    applicant_id: uuid.UUID
    amount: Decimal
    cadence: str
    start_date: _dt.date
    property_id: uuid.UUID | None = None
    end_date: _dt.date | None = None
    grace_days: int | None = Field(default=None, ge=0, le=365)
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def _check_amount(cls, v: Decimal) -> Decimal:
        return validate_money(v)

    @field_validator("cadence")
    @classmethod
    def _check_cadence(cls, v: str) -> str:
        if v not in RENT_CADENCES:
            raise ValueError(f"cadence must be one of {', '.join(RENT_CADENCES)}")
        return v
