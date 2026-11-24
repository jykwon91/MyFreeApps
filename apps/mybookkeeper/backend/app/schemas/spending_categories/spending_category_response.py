"""One spending category as returned by the API."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class SpendingCategoryResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    is_default: bool
    archived_at: _dt.datetime | None = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
