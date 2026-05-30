"""Pydantic schema for PUT /welcome-manuals/{id} request body.

All fields optional — only explicitly-provided fields are updated. The
repository layer applies an explicit allowlist before ``setattr``.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_TITLE_MAX_LEN


class WelcomeManualUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=WELCOME_MANUAL_TITLE_MAX_LEN)
    intro_text: str | None = None
    # Explicit ``null`` un-tags the manual from its property; omitting the key
    # leaves the current tag unchanged (``exclude_unset`` in to_update_dict).
    property_id: uuid.UUID | None = None

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        """Return only the explicitly-provided fields (Pydantic ``exclude_unset``).

        ``title`` is required on the row, so an explicit ``null`` is treated as
        a no-op rather than a (constraint-violating) clear.
        """
        data = self.model_dump(exclude_unset=True)
        if "title" in data and data["title"] is None:
            data.pop("title")
        return data
