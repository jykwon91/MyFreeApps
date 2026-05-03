"""Review queue response schema — one item returned by GET /calendar/review-queue."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReviewQueueItemResponse(BaseModel):
    id: uuid.UUID
    email_message_id: str
    source_channel: str
    parsed_payload: dict
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
