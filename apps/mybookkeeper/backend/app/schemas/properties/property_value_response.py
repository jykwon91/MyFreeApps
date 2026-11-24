"""A property's person-entered current value, after it was saved."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel


class PropertyValueResponse(BaseModel):
    property_id: uuid.UUID
    estimated_value_cents: int | None = None
    estimated_value_as_of: _dt.date | None = None
