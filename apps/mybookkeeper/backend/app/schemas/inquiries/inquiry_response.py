"""Pydantic schema for full Inquiry detail responses.

Includes all messages and events — used by GET /inquiries/{id}.

PII fields (``inquirer_name`` etc.) are returned plaintext because the
EncryptedString TypeDecorator transparently decrypts on read.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict

from app.schemas.inquiries.inquiry_event_response import InquiryEventResponse
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse


class InquiryResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    listing_id: uuid.UUID | None = None

    source: str
    external_inquiry_id: str | None = None

    inquirer_name: str | None = None
    inquirer_email: str | None = None
    inquirer_phone: str | None = None
    inquirer_employer: str | None = None

    desired_start_date: _dt.date | None = None
    desired_end_date: _dt.date | None = None

    stage: str
    gut_rating: int | None = None
    notes: str | None = None

    received_at: _dt.datetime
    email_message_id: str | None = None

    # ID of the Applicant promoted from this inquiry (if any). Lets the
    # detail UI show "View applicant" instead of "Promote to applicant"
    # when the inquiry has already been converted (PR 3.2).
    linked_applicant_id: uuid.UUID | None = None

    messages: list[InquiryMessageResponse] = []
    events: list[InquiryEventResponse] = []

    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
