"""Pydantic schemas for source-related API requests and responses."""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, field_validator


class SourceCreate(BaseModel):
    kind: str
    url: str

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: str) -> str:
        if v not in ("youtube_playlist", "youtube_channel"):
            raise ValueError("kind must be youtube_playlist or youtube_channel")
        return v


class SourceRead(BaseModel):
    id: uuid.UUID
    kind: str
    config_json: dict
    last_synced_at: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


class SyncJobResponse(BaseModel):
    job_id: str
    source_id: uuid.UUID
    status: str = "queued"
    message: str = "Sync started — lineups will appear in pending_review when complete"
