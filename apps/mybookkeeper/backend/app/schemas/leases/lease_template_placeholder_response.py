"""Schema for a single placeholder spec on a lease template."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class LeaseTemplatePlaceholderResponse(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    key: str
    display_label: str
    input_type: str
    required: bool
    default_source: str | None = None
    computed_expr: str | None = None
    display_order: int
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
