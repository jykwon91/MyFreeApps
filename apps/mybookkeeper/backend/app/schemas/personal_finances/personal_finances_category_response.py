"""Spending under one heading over the range, as Monthly expenses heads it."""
from __future__ import annotations

from pydantic import BaseModel


class PersonalFinancesCategoryResponse(BaseModel):
    label: str
    cents: int
