"""Pydantic schema for creating an InquiryMessage.

Available in this PR for completeness — PR 2.3 will drive it from the
templated-replies endpoint. Not yet wired to a route.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.inquiry_enums import INQUIRY_MESSAGE_CHANNELS, INQUIRY_MESSAGE_DIRECTIONS

_ADDR_MAX = 255
_SUBJECT_MAX = 500
_BODY_MAX = 200_000  # large but bounded — emails can be hefty
_MSG_ID_MAX = 255


class InquiryMessageCreateRequest(BaseModel):
    direction: str
    channel: str
    from_address: str | None = Field(default=None, max_length=_ADDR_MAX)
    to_address: str | None = Field(default=None, max_length=_ADDR_MAX)
    subject: str | None = Field(default=None, max_length=_SUBJECT_MAX)
    raw_email_body: str | None = Field(default=None, max_length=_BODY_MAX)
    parsed_body: str | None = Field(default=None, max_length=_BODY_MAX)
    email_message_id: str | None = Field(default=None, max_length=_MSG_ID_MAX)
    sent_at: _dt.datetime | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "InquiryMessageCreateRequest":
        if self.direction not in INQUIRY_MESSAGE_DIRECTIONS:
            raise ValueError(
                f"direction must be one of {INQUIRY_MESSAGE_DIRECTIONS}, "
                f"got {self.direction!r}",
            )
        if self.channel not in INQUIRY_MESSAGE_CHANNELS:
            raise ValueError(
                f"channel must be one of {INQUIRY_MESSAGE_CHANNELS}, "
                f"got {self.channel!r}",
            )
        return self
