"""Pydantic schema for an InquiryMessage — used inside InquiryResponse and
returned standalone from PR 2.2's reply endpoints.

PII fields (``from_address``, ``to_address``) are returned in plaintext because
the EncryptedString TypeDecorator transparently decrypts on read; the host
needs to see the addresses in the inbox.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class InquiryMessageResponse(BaseModel):
    id: uuid.UUID
    inquiry_id: uuid.UUID
    direction: str
    channel: str
    from_address: str | None = None
    to_address: str | None = None
    subject: str | None = None
    raw_email_body: str | None = None
    parsed_body: str | None = None
    email_message_id: str | None = None
    sent_at: _dt.datetime | None = None
    created_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
