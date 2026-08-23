"""Pydantic schema for POST /welcome-manuals/{id}/email request body.

The host free-types the guest's contact details here. ``recipient_email`` is
validated as an email address (bad input → 422); ``recipient_name`` is an
optional display name used in the email greeting. ``room_id`` selects which
room's guide to build when the manual is split by room.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.welcome_manual_constants import WELCOME_MANUAL_RECIPIENT_NAME_MAX_LEN


class WelcomeManualEmailRequest(BaseModel):
    recipient_email: EmailStr
    recipient_name: str | None = Field(
        default=None, max_length=WELCOME_MANUAL_RECIPIENT_NAME_MAX_LEN,
    )
    # For a by-the-room manual: which room this guest is in. The emailed guide
    # then carries the shared sections plus that room's own. Omit on a
    # whole-property manual (and when the host wants every room's content).
    room_id: uuid.UUID | None = None

    model_config = ConfigDict(extra="forbid")
