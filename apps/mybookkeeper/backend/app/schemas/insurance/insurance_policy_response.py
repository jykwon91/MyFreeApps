"""Schema for a single insurance policy (detail view with attachments)."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.insurance.insurance_policy_attachment_response import (
    InsurancePolicyAttachmentResponse,
)
from app.services.insurance.premium_math import annual_premium_cents


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
    premium_cents: int | None = None
    premium_frequency: str | None = None
    deductible_cents: int | None = None
    wind_hail_deductible_pct: Decimal | None = None
    notes: str | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime
    attachments: list[InsurancePolicyAttachmentResponse]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def annual_premium_cents(self) -> int | None:
        """The premium restated as a yearly total — see the summary schema."""
        return annual_premium_cents(self.premium_cents, self.premium_frequency)

    model_config = ConfigDict(from_attributes=True)
