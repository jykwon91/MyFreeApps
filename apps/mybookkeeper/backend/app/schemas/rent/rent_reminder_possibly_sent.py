"""A failed try that may still have reached the tenant, as the operator saw it."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.rent_reminder_channel import RentReminderChannel


class RentReminderPossiblySent(BaseModel):
    model_config = ConfigDict(frozen=True)

    channel: RentReminderChannel
    # The row's try number. Send now compares it with what the operator was
    # shown, so a confirmation never covers a newer try they haven't seen.
    attempt: int = Field(ge=1)
