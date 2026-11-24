"""PUT /properties/{id}/estimated-value: what the person says the home is worth.

Dated today by the server. Null clears it, and the property goes back to
"add a value" on the net worth page.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.net_worth_constants import PROPERTY_VALUE_MAX_CENTS


class PropertyValueUpdateRequest(BaseModel):
    estimated_value_cents: int | None = Field(ge=0, le=PROPERTY_VALUE_MAX_CENTS)

    model_config = ConfigDict(extra="forbid")
