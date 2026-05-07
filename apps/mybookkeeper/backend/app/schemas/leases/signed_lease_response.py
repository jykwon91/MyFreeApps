"""Schema for a signed-lease detail view."""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.schemas.leases.signed_lease_template_link import SignedLeaseTemplateLink


class SignedLeaseResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organization_id: uuid.UUID
    # Resolved list of templates contributing to this lease (ordered by
    # the host's pick order via display_order). Empty for imported leases.
    templates: list[SignedLeaseTemplateLink]
    applicant_id: uuid.UUID
    listing_id: uuid.UUID | None = None
    kind: str
    values: dict[str, Any]
    status: str
    starts_on: _dt.date | None = None
    ends_on: _dt.date | None = None
    notes: str | None = None
    generated_at: _dt.datetime | None = None
    sent_at: _dt.datetime | None = None
    signed_at: _dt.datetime | None = None
    ended_at: _dt.datetime | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime
    attachments: list[SignedLeaseAttachmentResponse]

    model_config = ConfigDict(from_attributes=True)
