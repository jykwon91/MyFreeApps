"""Minimal Vendor payload for list / rolodex views.

Only the fields the host needs to see in the rolodex grid: name, category,
preferred flag, hourly rate, last_used_at. Full contact info / notes /
flat_rate_notes are loaded on the detail page.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class VendorSummary(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID

    name: str
    category: str
    hourly_rate: Decimal | None = None
    preferred: bool

    last_used_at: _dt.datetime | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
