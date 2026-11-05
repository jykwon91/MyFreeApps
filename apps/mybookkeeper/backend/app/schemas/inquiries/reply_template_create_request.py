"""Pydantic schema for POST /reply-templates."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.inquiries.reply_template_body import ReplyTemplateBody
from app.schemas.inquiries.reply_template_name import ReplyTemplateName
from app.schemas.inquiries.reply_template_subject import ReplyTemplateSubject


class ReplyTemplateCreateRequest(BaseModel):
    """Body for POST /reply-templates.

    ``organization_id`` and ``user_id`` are NOT accepted — resolved
    server-side from the request context.
    """

    name: ReplyTemplateName
    subject_template: ReplyTemplateSubject
    body_template: ReplyTemplateBody
    display_order: int = Field(default=0, ge=0, le=32767)

    model_config = ConfigDict(extra="forbid")
