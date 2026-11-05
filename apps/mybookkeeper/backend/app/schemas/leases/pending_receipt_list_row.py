"""One open rent receipt with the payment and tenant facts the list shows.

Returned by ``pending_rent_receipt_repo.list_open``. The tenant's owner,
emails and ``has_lease`` feed the send blocker and never leave the service layer.
``tenant_owner_id`` is None when the tenant is missing or deleted.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel


class PendingReceiptListRow(BaseModel):
    id: uuid.UUID
    transaction_id: uuid.UUID
    applicant_id: uuid.UUID
    signed_lease_id: uuid.UUID | None = None
    period_start_date: _dt.date
    period_end_date: _dt.date
    status: str
    sent_at: _dt.datetime | None = None
    sent_via_attachment_id: uuid.UUID | None = None
    created_at: _dt.datetime

    amount: Decimal
    transaction_date: _dt.date
    payer_name: str | None = None
    payment_method: str | None = None
    vendor: str | None = None
    attributed: bool
    tenant_owner_id: uuid.UUID | None = None
    tenant_name: str | None = None
    contact_email: str | None = None
    inquirer_email: str | None = None
    has_lease: bool
