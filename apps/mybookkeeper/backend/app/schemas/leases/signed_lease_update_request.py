"""Schema for PATCH /signed-leases/{id} — notes, status, house, values (draft-only)."""
from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict


class SignedLeaseUpdateRequest(BaseModel):
    notes: str | None = None
    status: str | None = None
    # Only honoured when current status == "draft" — service enforces.
    values: dict[str, Any] | None = None
    # Per-lease toggle for the auto-email-tenant-on-generate feature.
    # ``None`` (omitted) leaves the existing value alone; ``True`` /
    # ``False`` overwrites it.
    auto_email_tenant: bool | None = None
    # Move the lease to another of the organization's houses — allowed at
    # any status. ``None`` leaves it alone. A listing for a different house
    # is cleared.
    property_id: uuid.UUID | None = None

    model_config = ConfigDict(extra="forbid")
