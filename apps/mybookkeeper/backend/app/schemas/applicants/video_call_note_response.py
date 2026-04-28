"""Pydantic schema for a VideoCallNote response.

``notes`` is returned plaintext via ``EncryptedString`` decryption.
Auth-protected at the route layer.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class VideoCallNoteResponse(BaseModel):
    id: uuid.UUID
    applicant_id: uuid.UUID
    scheduled_at: _dt.datetime
    completed_at: _dt.datetime | None = None
    notes: str | None = None
    gut_rating: int | None = None
    transcript_storage_key: str | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
