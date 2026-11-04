"""A screening result's private parts. Only returned by the audited reveal."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class ScreeningReportResponse(BaseModel):
    id: uuid.UUID
    adverse_action_snippet: str | None = None
    # Read by the URL attacher; the object key never leaves the server.
    report_storage_key: str | None = Field(default=None, exclude=True)
    presigned_url: str | None = None
    # False when the file is missing from storage.
    is_available: bool = True

    model_config = ConfigDict(from_attributes=True)
