from __future__ import annotations

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.welcome_manual_constants import SHARE_PIN_LENGTH


class WelcomeManualSharePinUpdateRequest(BaseModel):
    """PATCH body for rotating a manual's share PIN.

    ``pin`` omitted/``null`` regenerates a random PIN; an explicit value must
    be exactly ``SHARE_PIN_LENGTH`` digits.
    """

    pin: str | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("pin")
    @classmethod
    def _validate_pin(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if len(value) != SHARE_PIN_LENGTH or not value.isdigit():
            raise ValueError(f"pin must be exactly {SHARE_PIN_LENGTH} digits")
        return value
