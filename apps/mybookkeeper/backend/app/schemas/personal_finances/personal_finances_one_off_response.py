"""A large payment in that doesn't recur (``ONE_OFF_MIN_CENTS``)."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel


class PersonalFinancesOneOffResponse(BaseModel):
    transaction_id: uuid.UUID
    date: _dt.date
    payee: str
    amount_cents: int
