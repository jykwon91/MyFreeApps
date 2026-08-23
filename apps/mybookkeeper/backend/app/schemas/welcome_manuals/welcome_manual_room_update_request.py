"""Pydantic schema for PATCH /welcome-manuals/{id}/rooms/{room_id}."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_ROOM_NAME_MAX_LEN


class WelcomeManualRoomUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=WELCOME_MANUAL_ROOM_NAME_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        """Return only explicitly-provided fields. An explicit ``null`` name is
        a no-op — name is required."""
        data = self.model_dump(exclude_unset=True)
        if "name" in data and data["name"] is None:
            data.pop("name")
        return data
