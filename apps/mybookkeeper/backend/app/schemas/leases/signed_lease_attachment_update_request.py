"""Request body for PATCH /signed-leases/{lease_id}/attachments/{attachment_id}."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SignedLeaseAttachmentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
