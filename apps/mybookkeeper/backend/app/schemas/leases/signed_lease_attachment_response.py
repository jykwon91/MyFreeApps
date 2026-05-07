"""Schema for a single attachment on a signed lease."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class SignedLeaseAttachmentResponse(BaseModel):
    id: uuid.UUID
    lease_id: uuid.UUID
    filename: str
    storage_key: str
    content_type: str
    size_bytes: int
    kind: str
    uploaded_by_user_id: uuid.UUID
    uploaded_at: _dt.datetime
    # Signing-state timestamps. NULL = not yet signed by that party.
    # Drives the friendly download filename suffix.
    signed_by_tenant_at: _dt.datetime | None = None
    signed_by_landlord_at: _dt.datetime | None = None
    presigned_url: str | None = None
    # ``False`` means the row exists in the DB but the underlying MinIO
    # object is missing (NoSuchKey on HEAD). Set by the response builder so
    # the UI can render "File missing — re-upload" instead of an "Open" link
    # that 404s. Defaults to ``True`` so legacy callers / tests that
    # construct this schema directly don't have to set it.
    is_available: bool = True

    model_config = ConfigDict(from_attributes=True)
