"""Pydantic schema for POST /welcome-manuals request body.

``organization_id`` and ``user_id`` are NOT accepted — they're resolved
server-side from the request context. ``property_id`` is an optional tag.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_TITLE_MAX_LEN


class WelcomeManualCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=WELCOME_MANUAL_TITLE_MAX_LEN)
    intro_text: str | None = None
    property_id: uuid.UUID | None = None
    # When True (default), the new manual is pre-seeded with stub sections
    # (Wi-Fi, Parking, Trash & Recycling, Laundry, Check-out) so the host
    # starts from a structure instead of a blank page.
    seed_default_sections: bool = True

    model_config = ConfigDict(extra="forbid")
