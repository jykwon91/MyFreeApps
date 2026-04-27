"""Pydantic schema for PATCH /reply-templates/{id}.

All fields optional — only provided fields are updated. The repository layer
applies an explicit allowlist before ``setattr`` per the project security rule.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

_NAME_MAX = 100
_SUBJECT_MAX = 500
_BODY_MAX = 10000


class ReplyTemplateUpdateRequest(BaseModel):
    """Body for PATCH /reply-templates/{id} — every field optional."""

    name: str | None = Field(default=None, min_length=1, max_length=_NAME_MAX)
    subject_template: str | None = Field(
        default=None, min_length=1, max_length=_SUBJECT_MAX,
    )
    body_template: str | None = Field(
        default=None, min_length=1, max_length=_BODY_MAX,
    )
    display_order: int | None = Field(default=None, ge=0, le=32767)
    is_archived: bool | None = None

    model_config = ConfigDict(extra="forbid")

    def to_update_dict(self) -> dict[str, object]:
        """Return only the explicitly-provided fields."""
        return self.model_dump(exclude_unset=True)
