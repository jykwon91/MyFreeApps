"""Pydantic schema for PATCH .../sections/{section_id}/fields/{field_id}.

Allows label editing, value editing (including clearing to null), and
reordering (display_order).
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import (
    WELCOME_MANUAL_FIELD_LABEL_MAX_LEN,
    WELCOME_MANUAL_FIELD_VALUE_MAX_LEN,
)


class WelcomeManualSectionFieldUpdateRequest(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=WELCOME_MANUAL_FIELD_LABEL_MAX_LEN)
    value: str | None = Field(default=None, max_length=WELCOME_MANUAL_FIELD_VALUE_MAX_LEN)
    display_order: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        """Return only explicitly-provided fields. An explicit ``null`` label is
        a no-op (label is required); an explicit ``null`` value clears it."""
        data = self.model_dump(exclude_unset=True)
        if "label" in data and data["label"] is None:
            data.pop("label")
        return data
