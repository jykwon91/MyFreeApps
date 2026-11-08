"""Pydantic schema for PATCH /applicants/{applicant_id}/contact-email.

``null`` or a blank string removes the address; anything else must be a
valid email. ``extra="forbid"`` rejects stray fields with a 422.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.applicant_constants import APPLICANT_CONTACT_EMAIL_MAX


class ApplicantContactEmailRequest(BaseModel):
    contact_email: EmailStr | None = Field(max_length=APPLICANT_CONTACT_EMAIL_MAX)

    model_config = ConfigDict(extra="forbid")

    @field_validator("contact_email", mode="before")
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value
