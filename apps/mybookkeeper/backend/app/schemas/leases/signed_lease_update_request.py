"""Schema for PATCH /signed-leases/{id} — notes, status, values (draft-only)."""
from __future__ import annotations

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

    model_config = ConfigDict(extra="forbid")
