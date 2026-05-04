"""Schema for a single attachment on an insurance policy."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class InsurancePolicyAttachmentResponse(BaseModel):
    id: uuid.UUID
    policy_id: uuid.UUID
    filename: str
    storage_key: str
    content_type: str
    size_bytes: int
    kind: str
    uploaded_by_user_id: uuid.UUID
    uploaded_at: _dt.datetime
    presigned_url: str | None = None

    model_config = ConfigDict(from_attributes=True)
