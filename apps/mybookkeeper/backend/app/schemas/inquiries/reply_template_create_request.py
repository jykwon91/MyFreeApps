"""Pydantic schema for POST /reply-templates."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

_NAME_MAX = 100
_SUBJECT_MAX = 500
_BODY_MAX = 10000


class ReplyTemplateCreateRequest(BaseModel):
    """Body for POST /reply-templates.

    ``organization_id`` and ``user_id`` are NOT accepted — resolved
    server-side from the request context.
    """

    name: str = Field(min_length=1, max_length=_NAME_MAX)
    subject_template: str = Field(min_length=1, max_length=_SUBJECT_MAX)
    body_template: str = Field(min_length=1, max_length=_BODY_MAX)
    display_order: int = Field(default=0, ge=0, le=32767)

    model_config = ConfigDict(extra="forbid")
