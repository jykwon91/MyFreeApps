"""Pydantic schema for POST /welcome-manuals/{id}/rooms request body."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_ROOM_NAME_MAX_LEN


class WelcomeManualRoomCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=WELCOME_MANUAL_ROOM_NAME_MAX_LEN)

    model_config = ConfigDict(extra="forbid")
