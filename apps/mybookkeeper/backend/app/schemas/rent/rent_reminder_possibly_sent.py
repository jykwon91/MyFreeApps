"""A failed try that may still have reached the tenant, as the operator saw it."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RentReminderPossiblySent(BaseModel):
    model_config = ConfigDict(frozen=True)

    channel: Literal["email", "sms"]
    # The row's try number. Send now compares it with what the operator was
    # shown, so a confirmation never covers a newer try they haven't seen.
    attempt: int = Field(ge=1)
