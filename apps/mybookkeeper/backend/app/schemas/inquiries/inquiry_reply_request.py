"""Pydantic schema for POST /inquiries/{id}/reply.

The host edits the rendered template in the composer before sending — so the
final ``subject`` and ``body`` come from the frontend, not the template
verbatim. ``template_id`` is captured for analytics ("which templates are
used most?") but is optional because the host may write a custom reply.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.inquiries.one_line import require_one_line

_SUBJECT_MAX = 500
_BODY_MAX = 50000


class InquiryReplyRequest(BaseModel):
    template_id: uuid.UUID | None = None
    subject: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=_SUBJECT_MAX),
        AfterValidator(require_one_line),
    ]
    body: str = Field(min_length=1, max_length=_BODY_MAX)

    model_config = ConfigDict(extra="forbid")
