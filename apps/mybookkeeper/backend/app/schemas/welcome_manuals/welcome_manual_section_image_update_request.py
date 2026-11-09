"""Pydantic schema for PATCH .../sections/{section_id}/images/{image_id}.

Allows caption editing. Position only changes through the atomic reorder
endpoint.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_IMAGE_CAPTION_MAX_LEN


class WelcomeManualSectionImageUpdateRequest(BaseModel):
    caption: str | None = Field(default=None, max_length=WELCOME_MANUAL_IMAGE_CAPTION_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)
