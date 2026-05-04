"""Schema for a single insurance policy (detail view with attachments)."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict

from app.schemas.insurance.insurance_policy_attachment_response import (
    InsurancePolicyAttachmentResponse,
)


class InsurancePolicyResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organization_id: uuid.UUID
    listing_id: uuid.UUID
    policy_name: str
    carrier: str | None = None
    policy_number: str | None = None
    effective_date: _dt.date | None = None
    expiration_date: _dt.date | None = None
    coverage_amount_cents: int | None = None
    notes: str | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime
    attachments: list[InsurancePolicyAttachmentResponse]

    model_config = ConfigDict(from_attributes=True)
