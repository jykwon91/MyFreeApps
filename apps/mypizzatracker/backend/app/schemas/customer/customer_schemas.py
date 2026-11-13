"""Pydantic schemas for Customer.

The customer-facing order entry doesn't expose customer ID -- the order
endpoint takes ``CustomerCreate`` inline and the service upserts. The
owner-facing customer DB views surface :class:`CustomerListItem` (with
order rollup stats) and accept :class:`CustomerNotesUpdate` for inline
notes editing.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from app.schemas.text_fields.customer_notes import CustomerNotes
from app.schemas.text_fields.customer_phone import CustomerPhone
from app.schemas.text_fields.required_name import RequiredName


class CustomerCreate(BaseModel):
    """Inline customer payload embedded in a public order request.

    Phone is normalized to digits-only by the service before persisting.
    Name and phone are trimmed by the schema; empty after trim is rejected (422).
    The service still defends post-trim as a second line.
    """

    name: RequiredName
    phone: CustomerPhone


class CustomerRead(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerListItem(BaseModel):
    """Operator-facing row for the /customers list view.

    ``order_count`` excludes nothing -- it counts every order the customer
    has ever placed, including no-shows. ``last_order_at`` is the timestamp
    of the most recent order (any status); ``None`` for customers who
    somehow have a row but no orders (shouldn't happen in normal flow but
    the outer join tolerates it).
    """

    id: uuid.UUID
    name: str
    phone: str
    notes: Optional[str] = None
    order_count: int
    last_order_at: Optional[datetime] = None


class CustomerNotesUpdate(BaseModel):
    """Owner-only patch shape for the ``notes`` column."""

    notes: Optional[CustomerNotes] = None
