"""Pydantic schema for POST .../sections/{section_id}/fields request body."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import (
    WELCOME_MANUAL_FIELD_LABEL_MAX_LEN,
    WELCOME_MANUAL_FIELD_VALUE_MAX_LEN,
)


class WelcomeManualSectionFieldCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=WELCOME_MANUAL_FIELD_LABEL_MAX_LEN)
    value: str | None = Field(default=None, max_length=WELCOME_MANUAL_FIELD_VALUE_MAX_LEN)

    model_config = ConfigDict(extra="forbid")
