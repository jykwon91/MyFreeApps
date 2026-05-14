"""Pydantic schemas for Drop + Slot.

Drop status transitions:
  planning -> active   (forward; service-layer requires >= 1 slot)
  planning -> closed   (cancel a never-run drop)
  active   -> closed   (service complete)
  closed   -> *        (terminal; no further changes)

DropUpdate restricts the editable fields based on the drop's current status;
the API layer enforces that. Schemas here just describe the wire shape.
"""
from __future__ import annotations

import uuid
from datetime import date as _date, datetime, time as _time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator

DROP_STATUSES: tuple[str, ...] = ("planning", "active", "closed")


# ---------------------------------------------------------------------------
# Slot
# ---------------------------------------------------------------------------

class SlotCreate(BaseModel):
    pickup_time: _time
    max_pizzas: int = Field(..., gt=0)


class SlotUpdate(BaseModel):
    pickup_time: Optional[_time] = None
    max_pizzas: Optional[int] = Field(None, gt=0)


class SlotRead(BaseModel):
    id: uuid.UUID
    drop_id: uuid.UUID
    pickup_time: _time
    max_pizzas: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Drop
# ---------------------------------------------------------------------------

class DropCreate(BaseModel):
    date: _date
    name: str = Field(..., min_length=1, max_length=100)
    slot_window_start: _time
    slot_window_end: _time

    @model_validator(mode="after")
    def _window_valid(self) -> "DropCreate":
        if self.slot_window_start >= self.slot_window_end:
            raise ValueError("slot_window_start must be before slot_window_end")
        return self


class DropUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    date: Optional[_date] = None
    slot_window_start: Optional[_time] = None
    slot_window_end: Optional[_time] = None
    status: Optional[str] = None
    tip_total: Optional[Decimal] = Field(None, ge=0)

    @model_validator(mode="after")
    def _window_valid(self) -> "DropUpdate":
        if (
            self.slot_window_start is not None
            and self.slot_window_end is not None
            and self.slot_window_start >= self.slot_window_end
        ):
            raise ValueError("slot_window_start must be before slot_window_end")
        if self.status is not None and self.status not in DROP_STATUSES:
            raise ValueError(f"status must be one of {DROP_STATUSES}")
        return self


class DropRead(BaseModel):
    id: uuid.UUID
    date: _date
    name: str
    slot_window_start: _time
    slot_window_end: _time
    status: str
    tip_total: Decimal
    created_at: datetime
    updated_at: datetime
    slots: list[SlotRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}
