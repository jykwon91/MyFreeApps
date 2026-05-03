"""Request schema for updating a single placeholder spec."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class LeaseTemplatePlaceholderUpdateRequest(BaseModel):
    display_label: str | None = None
    input_type: str | None = None
    required: bool | None = None
    default_source: str | None = None
    # Empty string clears the existing computed_expr; omit the field to leave it as-is.
    computed_expr: str | None = None
    display_order: int | None = None

    model_config = ConfigDict(extra="forbid")
