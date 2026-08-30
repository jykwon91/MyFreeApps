"""Partial update for a rent schedule. Omitted fields are left unchanged.

``amount`` and ``cadence`` are deliberately absent: changing either would
silently alter what was already owed for past periods. A rent change is made by
ending this schedule and starting a new one, which preserves the historical
charges at the rate they were generated.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, Field


class RentScheduleUpdateRequest(BaseModel):
    end_date: _dt.date | None = None
    grace_days: int | None = Field(default=None, ge=0, le=365)
    notes: str | None = None
