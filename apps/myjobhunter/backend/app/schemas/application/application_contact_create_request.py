"""Pydantic schema for POST /applications/{id}/contacts request body.

Mirrors the writable columns on ``ApplicationContact``. Server-managed
columns (``id``, ``user_id``, ``application_id``, ``created_at``,
``updated_at``) are NOT accepted — they are resolved from the request
context or populated by the persistence layer.

``extra='forbid'`` defends against a malicious client trying to inject
``user_id`` or ``application_id`` via the body.

``role`` is validated against ``ContactRole.ALL`` to match the DB CHECK
constraint. At least one of ``name`` or ``email`` is required so that a
contact is minimally identifiable.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.core.enums import ContactRole

_NAME_MAX_LEN = 200
_LINKEDIN_MAX_LEN = 2048
_NOTES_MAX_LEN = 5000


class ApplicationContactCreateRequest(BaseModel):
    """Body for POST /applications/{application_id}/contacts."""

    name: str | None = Field(default=None, max_length=_NAME_MAX_LEN)
    email: EmailStr | None = None
    linkedin_url: str | None = Field(default=None, max_length=_LINKEDIN_MAX_LEN)
    role: str | None = None
    notes: str | None = Field(default=None, max_length=_NOTES_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "ApplicationContactCreateRequest":
        if self.name is None and self.email is None:
            raise ValueError("At least one of 'name' or 'email' is required.")
        if self.role is not None and self.role not in ContactRole.ALL:
            raise ValueError(
                f"role must be one of {ContactRole.ALL}, got {self.role!r}",
            )
        return self
