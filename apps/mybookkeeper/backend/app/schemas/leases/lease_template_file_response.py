"""Schema for a single source file inside a lease template bundle."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class LeaseTemplateFileResponse(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    filename: str
    storage_key: str
    content_type: str
    size_bytes: int
    display_order: int
    created_at: _dt.datetime
    # Presigned URL injected by the service layer; None when storage is down.
    presigned_url: str | None = None

    model_config = ConfigDict(from_attributes=True)
