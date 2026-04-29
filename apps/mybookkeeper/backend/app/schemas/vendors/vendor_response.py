"""Pydantic schema for a Vendor response (full payload).

Used by GET /vendors/{id}. Vendors carry no PII so every field is plaintext.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class VendorResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID

    name: str
    category: str

    phone: str | None = None
    email: str | None = None
    address: str | None = None

    hourly_rate: Decimal | None = None
    flat_rate_notes: str | None = None

    preferred: bool
    notes: str | None = None

    last_used_at: _dt.datetime | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
