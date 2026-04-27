"""Pydantic schema for PATCH /inquiries/{id} request body.

All fields optional — only provided fields are updated. The repository layer
applies an explicit allowlist before ``setattr`` per the project security rule.

``source`` is intentionally NOT updatable — once an inquiry is associated
with a source platform it stays there. Use stage = 'archived' to retire a
mis-routed inquiry.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.inquiry_enums import INQUIRY_STAGES

_NAME_MAX = 255
_EMAIL_MAX = 255
_PHONE_MAX = 50
_EMPLOYER_MAX = 255
_NOTES_MAX = 5000


class InquiryUpdateRequest(BaseModel):
    """Body for PATCH /inquiries/{id} — every field optional."""

    listing_id: uuid.UUID | None = None

    inquirer_name: str | None = Field(default=None, max_length=_NAME_MAX)
    inquirer_email: str | None = Field(default=None, max_length=_EMAIL_MAX)
    inquirer_phone: str | None = Field(default=None, max_length=_PHONE_MAX)
    inquirer_employer: str | None = Field(default=None, max_length=_EMPLOYER_MAX)

    desired_start_date: _dt.date | None = None
    desired_end_date: _dt.date | None = None

    stage: str | None = None
    gut_rating: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = Field(default=None, max_length=_NOTES_MAX)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "InquiryUpdateRequest":
        if self.stage is not None and self.stage not in INQUIRY_STAGES:
            raise ValueError(
                f"stage must be one of {INQUIRY_STAGES}, got {self.stage!r}",
            )
        if (
            self.desired_start_date is not None
            and self.desired_end_date is not None
            and self.desired_start_date > self.desired_end_date
        ):
            raise ValueError("desired_start_date cannot be after desired_end_date")
        return self

    def to_update_dict(self) -> dict[str, object]:
        """Return only the explicitly-provided fields (Pydantic ``exclude_unset``)."""
        return self.model_dump(exclude_unset=True)
