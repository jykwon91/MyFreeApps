"""Pydantic schema for POST /welcome-manuals/{id}/sections request body."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_SECTION_TITLE_MAX_LEN


class WelcomeManualSectionCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=WELCOME_MANUAL_SECTION_TITLE_MAX_LEN)
    body: str | None = None

    model_config = ConfigDict(extra="forbid")
