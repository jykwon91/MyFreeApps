"""Pydantic schema for PATCH /welcome-manuals/{id}/sections/{section_id}."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_SECTION_TITLE_MAX_LEN


class WelcomeManualSectionUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=WELCOME_MANUAL_SECTION_TITLE_MAX_LEN)
    body: str | None = None

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        """Return only explicitly-provided fields. An explicit ``null`` title is
        a no-op (title is required); an explicit ``null`` body clears it."""
        data = self.model_dump(exclude_unset=True)
        if "title" in data and data["title"] is None:
            data.pop("title")
        return data
