"""Response schema for listing blackout attachments."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ListingBlackoutAttachmentResponse(BaseModel):
    id: uuid.UUID
    listing_blackout_id: uuid.UUID
    storage_key: str
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by_user_id: uuid.UUID
    uploaded_at: datetime
    # Presigned URL injected by the service layer — None when storage is unavailable.
    presigned_url: str | None = None

    model_config = ConfigDict(from_attributes=True)
