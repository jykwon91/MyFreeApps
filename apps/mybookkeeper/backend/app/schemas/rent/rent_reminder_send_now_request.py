"""Payload for sending the next reminder immediately on one channel."""
from __future__ import annotations

from pydantic import BaseModel, field_validator

from app.core.rent_reminder_enums import RENT_REMINDER_CHANNELS


class RentReminderSendNowRequest(BaseModel):
    channel: str

    @field_validator("channel")
    @classmethod
    def _check_channel(cls, v: str) -> str:
        if v not in RENT_REMINDER_CHANNELS:
            raise ValueError(f"channel must be one of {', '.join(RENT_REMINDER_CHANNELS)}")
        return v
