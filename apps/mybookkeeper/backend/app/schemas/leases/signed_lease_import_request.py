"""Schema for POST /signed-leases/import — upload externally-signed PDFs."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class SignedLeaseImportRequest(BaseModel):
    applicant_id: uuid.UUID
    listing_id: uuid.UUID | None = None
    starts_on: _dt.date | None = None
    ends_on: _dt.date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    # Default to 'signed' — by definition, imported leases are already signed.
    status: str = "signed"

    model_config = ConfigDict(extra="forbid")
