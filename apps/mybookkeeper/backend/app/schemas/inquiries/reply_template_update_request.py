"""Pydantic schema for PATCH /reply-templates/{id}.

All fields optional — only provided fields are updated. The repository layer
applies an explicit allowlist before ``setattr`` per the project security rule.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.inquiries.reply_template_body import ReplyTemplateBody
from app.schemas.inquiries.reply_template_name import ReplyTemplateName
from app.schemas.inquiries.reply_template_subject import ReplyTemplateSubject


class ReplyTemplateUpdateRequest(BaseModel):
    """Body for PATCH /reply-templates/{id} — every field optional."""

    name: ReplyTemplateName | None = None
    subject_template: ReplyTemplateSubject | None = None
    body_template: ReplyTemplateBody | None = None
    display_order: int | None = Field(default=None, ge=0, le=32767)
    is_archived: bool | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _no_explicit_nulls(cls, data: Any) -> Any:
        # Leaving a field out means "don't change it"; null would try to clear a required column.
        if isinstance(data, dict):
            nulls = sorted(key for key, value in data.items() if value is None)
            if nulls:
                raise ValueError(f"Leave out a field you don't want to change rather than sending null: {', '.join(nulls)}")
        return data

    def to_update_dict(self) -> dict[str, object]:
        """Return only the explicitly-provided fields."""
        return self.model_dump(exclude_unset=True)
