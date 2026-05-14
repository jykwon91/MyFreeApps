"""Pydantic schemas for Customer.

The customer-facing order entry doesn't expose customer ID -- the order
endpoint takes ``CustomerCreate`` inline and the service upserts. These
schemas are reused by future owner-facing customer DB views (PR 10).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    """Inline customer payload embedded in a public order request.

    Phone is normalized to digits-only by the service before persisting.
    Name is trimmed; empty after trim is rejected (Field min_length=1 catches
    pre-trim emptiness, but the service also defends post-trim).
    """

    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=1, max_length=20)


class CustomerRead(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
